import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { resolveCaptureDate } from '@/server/photos/capture-date';
import { fixturePath, MANIFEST } from '../fixtures/photos/generate';

const read = (name: string) => readFileSync(fixturePath(name));
const NOW = new Date('2026-09-25T15:00:00Z');

const jpeg = (exif: Record<string, string>) =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: 'red' } })
    .jpeg()
    .withExif({ IFD2: exif })
    .toBuffer();

describe('resolveCaptureDate', () => {
  test('every dated fixture lands on its manifest date (SC-003)', async () => {
    for (const [name, entry] of Object.entries(MANIFEST)) {
      if (entry.date_source !== 'exif') continue;
      const result = await resolveCaptureDate(read(name), 'America/Chicago', NOW);
      expect(result, name).toEqual({
        captureDate: entry.capture_date,
        captureTime: entry.capture_time,
        dateSource: 'exif',
      });
    }
  });

  test('DateTimeOriginal wins over CreateDate, and CreateDate is the fallback', async () => {
    const both = await jpeg({
      DateTimeOriginal: '2026:03:14 09:00:00',
      DateTimeDigitized: '2026:03:15 09:00:00',
    });
    expect((await resolveCaptureDate(both, 'UTC', NOW)).captureTime).toBe('2026-03-14T09:00:00');
    const createOnly = await jpeg({ DateTimeDigitized: '2026:03:15 07:45:10' });
    expect(await resolveCaptureDate(createOnly, 'UTC', NOW)).toEqual({
      captureDate: '2026-03-15',
      captureTime: '2026-03-15T07:45:10',
      dateSource: 'exif',
    });
  });

  test('offsets are ignored: 23:30 stays on Mar 14 in every zone (V6)', async () => {
    for (const zone of ['Asia/Tokyo', 'America/Los_Angeles', 'UTC', 'Pacific/Kiritimati']) {
      const r = await resolveCaptureDate(read('2026-03-14_2330.jpg'), zone, NOW);
      expect(r.captureDate, zone).toBe('2026-03-14');
      expect(r.captureTime).toBe('2026-03-14T23:30:00');
    }
  });

  test('no date, a future date, and a pre-1900 date fall back to now in the uploader’s zone (V5)', async () => {
    for (const name of ['no-date.jpg', 'future-date.jpg', 'pre-1900.jpg', 'cmyk-adobe.jpg']) {
      expect(await resolveCaptureDate(read(name), 'Asia/Tokyo', NOW), name).toEqual({
        captureDate: '2026-09-26',
        captureTime: '2026-09-26T00:00:00',
        dateSource: 'upload',
      });
      expect((await resolveCaptureDate(read(name), 'America/Chicago', NOW)).captureTime).toBe(
        '2026-09-25T10:00:00',
      );
    }
  });

  test('unparseable and impossible dates fall back', async () => {
    for (const value of [
      'not a date',
      '2026:02:30 10:00:00',
      '2026:03:14 25:00:00',
      '    :  :     :  :  ',
    ]) {
      const r = await resolveCaptureDate(await jpeg({ DateTimeOriginal: value }), 'UTC', NOW);
      expect(r.dateSource, value).toBe('upload');
    }
  });

  test('a date later than now in the uploader’s zone is future, even if it is past in UTC', async () => {
    // At 15:00 UTC it is already 00:00 on Sep 26 in Tokyo, but only 10:00 on Sep 25 in Chicago.
    const bytes = await jpeg({ DateTimeOriginal: '2026:09:25 20:00:00' });
    expect((await resolveCaptureDate(bytes, 'Asia/Tokyo', NOW)).dateSource).toBe('exif');
    expect((await resolveCaptureDate(bytes, 'America/Chicago', NOW)).dateSource).toBe('upload');
  });

  test('an invalid time zone falls back to UTC', async () => {
    for (const zone of ['Mars/Olympus', '', '../../etc']) {
      expect(await resolveCaptureDate(read('no-date.jpg'), zone, NOW)).toMatchObject({
        captureTime: '2026-09-25T15:00:00',
        dateSource: 'upload',
      });
    }
  });

  test('capture_date is always the date part of capture_time', async () => {
    for (const name of Object.keys(MANIFEST)) {
      if (MANIFEST[name]?.format === null || name.startsWith('too-big') || name === 'broken.jpg')
        continue;
      const r = await resolveCaptureDate(read(name), 'UTC', NOW);
      expect(r.captureTime.slice(0, 10), name).toBe(r.captureDate);
    }
  });
});
