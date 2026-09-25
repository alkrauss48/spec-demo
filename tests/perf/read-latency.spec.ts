import { readFileSync } from 'node:fs';
import { SERVER_LOG } from '../e2e/env';
import { expect, seed, test } from '../e2e/fixtures';

// Constitution "API response time": read p95 ≤ 300 ms. Pages are timed by their render
// duration, `full` media to headers sent (media.served), `thumb` media to the last byte
// (media.completed), all from the server log (plan.md Constraints).

const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.95) - 1)] ?? NaN;
};

test('read p95 ≤ 300 ms for the library, an album, and thumb/full media', async ({
  signedInPage: { page, email },
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'server-side timing; one browser is enough');
  test.setTimeout(5 * 60_000);
  const { photos } = seed(email, { count: 1000, albums: 100 });
  const tag = `perfread-${Date.now()}`;
  let n = 0;
  const get = async (path: string) => {
    const res = await page.request.get(path, { headers: { 'x-request-id': `${tag}-${++n}` } });
    expect(res.status(), path).toBe(200);
    await res.body();
  };

  for (let i = 0; i < 20; i++) await get('/');
  for (let i = 0; i < 20; i++) await get(`/albums/${photos[i % 100]!.captureTime.slice(0, 10)}`);
  for (const p of photos.slice(0, 200)) await get(`/media/photos/${p.id}/thumb`);
  for (const p of photos.slice(200, 250)) await get(`/media/photos/${p.id}/full`);

  const lines = readFileSync(SERVER_LOG, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('{') && l.includes(tag))
    .map(
      (l) =>
        JSON.parse(l) as {
          event: string;
          variant?: string;
          duration_ms?: number;
          total_ms?: number;
        },
    );
  const pick = (event: string, field: 'duration_ms' | 'total_ms', variant?: string) =>
    lines
      .filter((l) => l.event === event && (!variant || l.variant === variant))
      .map((l) => l[field] ?? NaN);

  const results = {
    library: pick('library.render', 'duration_ms'),
    album: pick('album.render', 'duration_ms'),
    thumb: pick('media.completed', 'total_ms', 'thumb'),
    full: pick('media.served', 'duration_ms', 'full'),
  };
  const summary = Object.entries(results)
    .map(([k, v]) => `${k} p95 ${p95(v)} ms (n=${v.length})`)
    .join('; ');
  testInfo.annotations.push({ type: 'read-p95', description: summary });
  console.log(`read latency: ${summary}`);
  expect(results.library).toHaveLength(20);
  expect(results.album).toHaveLength(20);
  expect(results.thumb).toHaveLength(200);
  expect(results.full).toHaveLength(50);
  for (const [name, values] of Object.entries(results))
    expect(p95(values), name).toBeLessThanOrEqual(300);
});
