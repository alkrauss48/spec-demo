import { afterEach, expect, test, vi } from 'vitest';
import { log, withRequestContext } from '@/server/log';

afterEach(() => vi.restoreAllMocks());

function capture(fn: () => void): Record<string, unknown>[] {
  const lines: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  fn();
  vi.restoreAllMocks();
  return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
}

test('every line is JSON with level, ts, requestId, and event', () => {
  const [line] = capture(() =>
    withRequestContext('req-123', () => log.info('photo.upload.accepted', { bytes: 10 })),
  );
  expect(line).toMatchObject({
    level: 'info',
    requestId: 'req-123',
    event: 'photo.upload.accepted',
    bytes: 10,
  });
  expect(typeof line?.ts).toBe('string');
  expect(new Date(line?.ts as string).toISOString()).toBe(line?.ts);
});

test('requestId is "none" outside a request', () => {
  const [line] = capture(() => log.warn('x'));
  expect(line).toMatchObject({ level: 'warn', requestId: 'none', event: 'x' });
});

test('fields outside the allow-list are dropped', () => {
  const [line] = capture(() =>
    log.error('photo.upload.rejected', {
      reason: 'UNSUPPORTED_TYPE',
      fileName: 'IMG_2041.jpg',
      email: 'jane@example.com',
      exif: { GPSLatitude: 41 },
      captureDate: '2026-03-14',
      token: 'abc',
    }),
  );
  expect(line).toEqual({
    level: 'error',
    ts: line?.ts,
    requestId: 'none',
    event: 'photo.upload.rejected',
    reason: 'UNSUPPORTED_TYPE',
  });
});
