import { beforeAll, describe, expect, test } from 'vitest';
import { getDb } from '@/server/db';
import { getLibraryGroups, getUsage } from '@/server/photos/queries';
import { freshDb } from '../integration/helpers';

type Row = { id: string; date: string; time: string; addedAt?: string };

function addUser(id: string) {
  getDb()
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`,
    )
    .run(id, id, `${id}@example.test`);
}

let n = 0;
function addPhoto(userId: string, row: Row) {
  getDb()
    .prepare(
      `INSERT INTO photo (id, user_id, original_filename, format, stored_format, width, height, stored_bytes,
         original_sha256, capture_date, capture_time, date_source, added_at)
       VALUES (?, ?, 'x.jpg', 'jpeg', 'jpeg', 640, 480, 100, ?, ?, ?, 'exif', ?)`,
    )
    .run(
      row.id.padEnd(22, '0'),
      userId,
      String(++n).padStart(64, '0'),
      row.date,
      `${row.date}T${row.time}`,
      row.addedAt ?? '2026-04-01T00:00:00.000Z',
    );
}

const id = (s: string) => s.padEnd(22, '0');

beforeAll(async () => {
  await freshDb();
  addUser('alice');
  addUser('bob');
  // Mar 14: 5 photos, with ties on capture_time broken by added_at, then id.
  addPhoto('alice', { id: 'm14e', date: '2026-03-14', time: '12:00:00' });
  addPhoto('alice', {
    id: 'm14d',
    date: '2026-03-14',
    time: '10:00:00',
    addedAt: '2026-04-02T00:00:00.000Z',
  });
  addPhoto('alice', {
    id: 'm14c',
    date: '2026-03-14',
    time: '10:00:00',
    addedAt: '2026-04-01T00:00:00.000Z',
  });
  addPhoto('alice', { id: 'm14b', date: '2026-03-14', time: '09:00:00' });
  addPhoto('alice', { id: 'm14a', date: '2026-03-14', time: '09:00:00' });
  addPhoto('alice', { id: 'm02a', date: '2026-03-02', time: '12:00:00' });
  addPhoto('alice', { id: 'j20a', date: '2026-01-20', time: '14:00:00' });
  addPhoto('alice', { id: 'j20b', date: '2026-01-20', time: '15:00:00' });
  addPhoto('alice', { id: 'd31a', date: '2025-12-31', time: '23:59:59' });
  addPhoto('bob', { id: 'bob1', date: '2026-03-20', time: '10:00:00' });
});

describe('getLibraryGroups', () => {
  test('groups newest first, albums newest first within a group (FR-001)', () => {
    const groups = getLibraryGroups('alice');
    expect(groups.map((g) => [g.yearMonth, g.label])).toEqual([
      ['2026-03', 'March 2026'],
      ['2026-01', 'January 2026'],
      ['2025-12', 'December 2025'],
    ]);
    expect(groups[0]?.albums.map((a) => [a.date, a.label])).toEqual([
      ['2026-03-14', 'Mar 14, 2026'],
      ['2026-03-02', 'Mar 2, 2026'],
    ]);
  });

  test('photo counts per album', () => {
    const groups = getLibraryGroups('alice');
    const counts = Object.fromEntries(
      groups.flatMap((g) => g.albums.map((a) => [a.date, a.photoCount])),
    );
    expect(counts).toEqual({ '2026-03-14': 5, '2026-03-02': 1, '2026-01-20': 2, '2025-12-31': 1 });
  });

  test('previews are the first 4 by capture_time, then added_at, then id (FR-003)', () => {
    const album = getLibraryGroups('alice')[0]?.albums[0];
    expect(album?.previews.map((p) => p.id)).toEqual([
      id('m14a'),
      id('m14b'),
      id('m14c'),
      id('m14d'),
    ]);
    expect(album?.previews[0]).toEqual({ id: id('m14a'), width: 640, height: 480 });
    const small = getLibraryGroups('alice')[1]?.albums[0];
    expect(small?.previews.map((p) => p.id)).toEqual([id('j20a'), id('j20b')]);
  });

  test("another user's photos never appear (FR-014)", () => {
    const all = JSON.stringify(getLibraryGroups('alice'));
    expect(all).not.toContain(id('bob1'));
    expect(all).not.toContain('2026-03-20');
    expect(
      getLibraryGroups('bob')
        .flatMap((g) => g.albums)
        .map((a) => a.date),
    ).toEqual(['2026-03-20']);
    expect(getLibraryGroups('nobody')).toEqual([]);
  });
});

describe('getUsage', () => {
  test('counts only the user’s photos against the 1,000 limit', () => {
    expect(getUsage('alice')).toEqual({ photoCount: 9, photoLimit: 1000 });
    expect(getUsage('bob')).toEqual({ photoCount: 1, photoLimit: 1000 });
    expect(getUsage('nobody')).toEqual({ photoCount: 0, photoLimit: 1000 });
  });
});
