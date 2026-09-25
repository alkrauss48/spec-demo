import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  albumLabel,
  dateTimeLabel,
  groupLabel,
  isIsoDate,
  nowInZone,
  photoCountLabel,
  timeLabel,
  usageLabel,
} from '@/lib/dates';

describe('labels', () => {
  test('album, group, time, and date-time labels', () => {
    expect(albumLabel('2026-03-14')).toBe('Mar 14, 2026');
    expect(albumLabel('2026-03-02')).toBe('Mar 2, 2026');
    expect(groupLabel('2026-03')).toBe('March 2026');
    expect(groupLabel('2026-12')).toBe('December 2026');
    expect(timeLabel('2026-03-14T23:30:05')).toBe('11:30 PM');
    expect(timeLabel('2026-03-14T00:05:00')).toBe('12:05 AM');
    expect(timeLabel('2026-03-14T12:00:00')).toBe('12:00 PM');
    expect(dateTimeLabel('2026-03-14T23:30:05')).toBe('Mar 14, 2026, 11:30 PM');
  });

  test('counts are singular or plural with thousands separators', () => {
    expect(photoCountLabel(1)).toBe('1 photo');
    expect(photoCountLabel(12)).toBe('12 photos');
    expect(photoCountLabel(1000)).toBe('1,000 photos');
    expect(usageLabel(412)).toBe('412 of 1,000 photos');
    expect(usageLabel(1000)).toBe('1,000 of 1,000 photos');
    expect(usageLabel(0)).toBe('0 of 1,000 photos');
  });
});

describe('isIsoDate', () => {
  test('accepts real calendar dates only', () => {
    expect(isIsoDate('2026-03-14')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-3-4')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-03-14T00:00:00')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('nowInZone', () => {
  afterEach(() => vi.useRealTimers());

  test('gives each zone its own local date around midnight UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T23:30:00Z'));
    expect(nowInZone('Asia/Tokyo')).toBe('2026-03-15T08:30:00');
    expect(nowInZone('America/Chicago')).toBe('2026-03-14T18:30:00');
    expect(nowInZone('UTC')).toBe('2026-03-14T23:30:00');
  });

  test('midnight is 00, not 24', () => {
    expect(nowInZone('UTC', new Date('2026-03-15T00:00:00Z'))).toBe('2026-03-15T00:00:00');
  });
});
