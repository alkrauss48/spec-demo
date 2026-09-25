import { readFileSync, statSync } from 'node:fs';
import exifr from 'exifr';
import heicDecode from 'heic-decode';
import sharp from 'sharp';
import { beforeAll, describe, expect, test } from 'vitest';
import { getDb } from '@/server/db';
import { fullPath } from '@/server/media-store';
import { convertHeic } from '@/server/photos/convert-heic';
import { ingestPhoto } from '@/server/photos/ingest';
import { fixturePath, MANIFEST } from '../fixtures/photos/generate';
import { createUser, freshDb } from '../integration/helpers';

const read = (name: string) => readFileSync(fixturePath(name));

function psnr(
  a: Buffer,
  aChannels: number,
  b: Uint8ClampedArray | Buffer,
  bChannels: number,
  pixels: number,
) {
  let sum = 0;
  for (let p = 0; p < pixels; p++) {
    for (let c = 0; c < 3; c++) {
      const d = a[p * aChannels + c]! - b[p * bChannels + c]!;
      sum += d * d;
    }
  }
  const mse = sum / (pixels * 3);
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

describe('convertHeic', () => {
  test('2026-01-20.heic → a full-resolution JPEG with no metadata, visually identical', async () => {
    const input = read('2026-01-20.heic');
    const { bytes, width, height } = await convertHeic(input);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    expect({ width, height }).toEqual({
      width: MANIFEST['2026-01-20.heic']!.width,
      height: MANIFEST['2026-01-20.heic']!.height,
    });
    const meta = await sharp(bytes).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width, height });
    expect(
      await exifr.parse(bytes, { gps: true, xmp: true, iptc: true, icc: false }),
    ).toBeUndefined();

    const decoded = await heicDecode({ buffer: input });
    const jpeg = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const value = psnr(jpeg.data, jpeg.info.channels, decoded.data, 4, width * height);
    expect(value).toBeGreaterThanOrEqual(40);
  });

  test('a rotated iPhone-style HEIC comes out upright with no Orientation tag', async () => {
    const { bytes, width, height } = await convertHeic(read('2026-01-21-rotated.heic'));
    const entry = MANIFEST['2026-01-21-rotated.heic']!;
    expect(width).toBeLessThan(height);
    expect({ width, height }).toEqual({ width: entry.width, height: entry.height });
    expect(await exifr.orientation(bytes)).toBeUndefined();
    const meta = await sharp(bytes).metadata();
    expect({ width: meta.width, height: meta.height, orientation: meta.orientation }).toEqual({
      width,
      height,
      orientation: undefined,
    });
  });
});

describe('ingestPhoto with HEIC', () => {
  beforeAll(async () => {
    await freshDb();
  });

  test('stores width/height equal to the full file’s pixels, ignoring the EXIF Orientation', async () => {
    const user = await createUser();
    const result = await ingestPhoto({
      userId: user.id,
      bytes: read('2026-01-21-rotated.heic'),
      originalFilename: '2026-01-21-rotated.heic',
      timezone: 'UTC',
    });
    const row = getDb().prepare('SELECT * FROM photo WHERE id = ?').get(result.photo.id) as Record<
      string,
      unknown
    >;
    expect(row.format).toBe('heic');
    expect(row.stored_format).toBe('jpeg');
    const path = fullPath(user.id, result.photo.id, 'jpeg');
    const meta = await sharp(path).metadata();
    expect({ width: row.width, height: row.height }).toEqual({
      width: meta.width,
      height: meta.height,
    });
    expect(row.width).toBeLessThan(row.height as number);
    expect(row.stored_bytes).toBe(statSync(path).size);
    expect(row.capture_date).toBe('2026-01-21');
  });
});
