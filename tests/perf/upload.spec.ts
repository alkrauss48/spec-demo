import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, test } from '../e2e/fixtures';
import { SERVER_LOG } from '../e2e/env';
import { fixturePath } from '../fixtures/photos/generate';

// SC-004: 100 photos in one action, all filed within 2 minutes on a 50 Mbps connection.
// Then a second batch to measure POST /api/photos write p95 by size and format (plan.md
// Complexity Tracking; the numbers feed T089).

const OUT = join('test-results', 'perf-fixtures');
const MBPS = 50;

/** A camera-sized JPEG (4032×3024) with noise, so it is realistically large. */
async function cameraJpeg(
  seed: number,
  quality: number,
  width = 4032,
  height = 3024,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: seed % 256, g: (seed * 7) % 256, b: (seed * 13) % 256 },
      noise: { type: 'gaussian', mean: 128, sigma: 30 },
    },
  })
    .jpeg({ quality })
    .withExif({
      IFD2: { DateTimeOriginal: `2026:04:${String((seed % 28) + 1).padStart(2, '0')} 10:00:00` },
    })
    .toBuffer();
}

/** Unique bytes for each copy: a COM segment after SOI (JPEG), or a `free` box at the end (HEIC). */
function uniqueJpeg(base: Buffer, i: number): Buffer {
  const text = Buffer.from(`copy-${i}-${Date.now()}`, 'latin1');
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0, text.length + 2]), text]);
  return Buffer.concat([base.subarray(0, 2), com, base.subarray(2)]);
}
function uniqueHeic(base: Buffer, i: number): Buffer {
  const payload = Buffer.from(`copy-${i}-${Date.now()}`, 'latin1');
  const box = Buffer.alloc(8);
  box.writeUInt32BE(8 + payload.length, 0);
  box.write('free', 4, 'latin1');
  return Buffer.concat([base, box, payload]);
}

function writeAll(dir: string, files: [string, Buffer][]): string[] {
  mkdirSync(dir, { recursive: true });
  return files.map(([name, bytes]) => {
    const path = join(dir, name);
    writeFileSync(path, bytes);
    return path;
  });
}

type Accepted = { format: string; bytes: number; duration_ms: number };

function acceptedSince(ts: string): Accepted[] {
  return readFileSync(SERVER_LOG, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('{') && l.includes('"photo.upload.accepted"'))
    .map((l) => JSON.parse(l) as Accepted & { ts: string })
    .filter((e) => e.ts >= ts);
}

const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)] ?? NaN;
};

test.describe('upload performance', () => {
  // Serial: the second test reads HEIC timings from the first, and neither should compete for CPU.
  test.describe.configure({ mode: 'serial' });
  test.skip(({ browserName }) => browserName !== 'chromium', 'network throttling needs CDP');

  test('SC-004: 100 JPEG/HEIC photos are filed within 2 minutes at 50 Mbps', async ({
    signedInPage: { page },
  }, testInfo) => {
    test.setTimeout(10 * 60_000);
    const jpegBase = await cameraJpeg(1, 85);
    const heicBase = readFileSync(fixturePath('perf-12mp.heic')); // 4032×3024, about 1.5 MB
    const batch: [string, Buffer][] = [];
    for (let i = 0; i < 100; i++) {
      batch.push(
        i % 2 === 0
          ? [`p${i}.jpg`, uniqueJpeg(jpegBase, i)]
          : [`p${i}.heic`, uniqueHeic(heicBase, i)],
      );
    }
    const paths = writeAll(join(OUT, 'batch100'), batch);
    const totalMB = batch.reduce((n, [, b]) => n + b.length, 0) / 1e6;

    await page.goto('/');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 20,
      downloadThroughput: (MBPS * 1e6) / 8,
      uploadThroughput: (MBPS * 1e6) / 8,
    });

    const start = Date.now();
    await page.locator('[data-upload-ready]').waitFor({ state: 'attached' });
    await page.locator('input[type="file"]').setInputFiles(paths);
    await expect(page.getByTestId('upload-summary')).toContainText('Added 100', {
      timeout: 120_000,
    });
    await expect(page.getByText('100 of 1,000 photos')).toBeVisible({
      timeout: 120_000 - (Date.now() - start),
    });
    const seconds = (Date.now() - start) / 1000;
    testInfo.annotations.push({
      type: 'SC-004',
      description: `100 photos (${totalMB.toFixed(0)} MB) in ${seconds.toFixed(1)} s`,
    });
    console.log(`SC-004: 100 photos (${totalMB.toFixed(0)} MB) filed in ${seconds.toFixed(1)} s`);
    expect(seconds).toBeLessThanOrEqual(120);
  });

  test('write p95 for JPEG/PNG/WebP ≤ 10 MB (budget), and > 10 MB and HEIC (exception)', async ({
    signedInPage: { page },
  }, testInfo) => {
    test.setTimeout(10 * 60_000);
    const since = new Date().toISOString();
    const small: [string, Buffer][] = [];
    const large: [string, Buffer][] = [];
    for (let i = 0; i < 10; i++) {
      // ≤ 10 MB: a 3 MP mix of JPEG, PNG, and WebP.
      const base = await cameraJpeg(100 + i, 90, 2016, 1512);
      if (i % 3 === 0) small.push([`s${i}.jpg`, base]);
      else if (i % 3 === 1)
        small.push([`s${i}.png`, await sharp(base).png({ compressionLevel: 6 }).toBuffer()]);
      else small.push([`s${i}.webp`, await sharp(base).webp({ quality: 90 }).toBuffer()]);
      // > 10 MB: full-size noisy JPEG at high quality (≈ 10–20 MB).
      large.push([`l${i}.jpg`, await cameraJpeg(200 + i, 98)]);
    }
    for (const [name, b] of small) expect(b.length, name).toBeLessThanOrEqual(10 * 1024 * 1024);
    for (const [name, b] of large) expect(b.length, name).toBeGreaterThan(10 * 1024 * 1024);
    const paths = writeAll(join(OUT, 'batch20'), [...small, ...large]);

    await page.goto('/');
    await page.locator('[data-upload-ready]').waitFor({ state: 'attached' });
    await page.locator('input[type="file"]').setInputFiles(paths);
    await expect(page.getByTestId('upload-summary')).toContainText('Added 20', {
      timeout: 5 * 60_000,
    });

    const accepted = acceptedSince(since);
    // The HEIC figures come from the SC-004 batch above, which runs first in this file.
    const heic = acceptedSince('').filter((e) => e.format === 'heic');
    const smallDur = accepted
      .filter((e) => e.format !== 'heic' && e.bytes <= 10 * 1024 * 1024)
      .map((e) => e.duration_ms);
    const largeDur = accepted
      .filter((e) => e.format !== 'heic' && e.bytes > 10 * 1024 * 1024)
      .map((e) => e.duration_ms);
    const summary = `write p95: ≤10 MB ${p95(smallDur)} ms (n=${smallDur.length}); >10 MB ${p95(largeDur)} ms (n=${largeDur.length}); HEIC ${p95(heic.map((e) => e.duration_ms))} ms (n=${heic.length})`;
    testInfo.annotations.push({ type: 'write-p95', description: summary });
    console.log(summary);
    expect(smallDur.length).toBe(10);
    expect(p95(smallDur)).toBeLessThanOrEqual(500);
  });
});
