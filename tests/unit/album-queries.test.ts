import { beforeAll, describe, expect, test } from 'vitest';
import { getDb } from '@/server/db';
import { getAlbumPhotos, getPhotoInAlbum } from '@/server/photos/queries';
import { freshDb } from '../integration/helpers';

const id = (s: string) => s.padEnd(22, '0');
let n = 0;

function addUser(userId: string) {
  getDb()
    .prepare(
      `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`,
    )
    .run(userId, userId, `${userId}@example.test`);
}

function addPhoto(
  userId: string,
  photoId: string,
  captureTime: string,
  opts: { addedAt?: string; dateSource?: 'exif' | 'upload' } = {},
) {
  getDb()
    .prepare(
      `INSERT INTO photo (id, user_id, original_filename, format, stored_format, width, height, stored_bytes,
         original_sha256, capture_date, capture_time, date_source, added_at)
       VALUES (?, ?, 'x.jpg', 'jpeg', 'jpeg', 640, 480, 100, ?, ?, ?, ?, ?)`,
    )
    .run(
      id(photoId),
      userId,
      String(++n).padStart(64, '0'),
      captureTime.slice(0, 10),
      captureTime,
      opts.dateSource ?? 'exif',
      opts.addedAt ?? '2026-04-01T00:00:00.000Z',
    );
}

beforeAll(async () => {
  await freshDb();
  addUser('alice');
  addUser('bob');
  addPhoto('alice', 'c', '2026-03-14T12:00:00');
  addPhoto('alice', 'b2', '2026-03-14T10:00:00', { addedAt: '2026-04-02T00:00:00.000Z' });
  addPhoto('alice', 'b1', '2026-03-14T10:00:00', { addedAt: '2026-04-01T00:00:00.000Z' });
  addPhoto('alice', 'a', '2026-03-14T09:00:00', { dateSource: 'upload' });
  addPhoto('alice', 'other-day', '2026-03-15T09:00:00');
  addPhoto('bob', 'bob', '2026-03-14T08:00:00');
});

describe('getAlbumPhotos', () => {
  test('orders by capture_time, then added_at, then id, oldest first (FR-012)', () => {
    const photos = getAlbumPhotos('alice', '2026-03-14');
    expect(photos.map((p) => p.id)).toEqual([id('a'), id('b1'), id('b2'), id('c')]);
    expect(photos.map((p) => [p.n, p.total])).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
    expect(photos[0]).toEqual({
      id: id('a'),
      width: 640,
      height: 480,
      captureTime: '2026-03-14T09:00:00',
      dateSource: 'upload',
      addedAt: '2026-04-01T00:00:00.000Z',
      n: 1,
      total: 4,
    });
  });

  test("another user's album is empty (FR-014)", () => {
    expect(getAlbumPhotos('bob', '2026-03-15')).toEqual([]);
    expect(getAlbumPhotos('bob', '2026-03-14').map((p) => p.id)).toEqual([id('bob')]);
    expect(getAlbumPhotos('nobody', '2026-03-14')).toEqual([]);
  });
});

describe('getPhotoInAlbum', () => {
  test('returns the photo with its neighbors, null at the ends', () => {
    expect(getPhotoInAlbum('alice', '2026-03-14', id('b1'))).toMatchObject({
      id: id('b1'),
      n: 2,
      total: 4,
      prevId: id('a'),
      nextId: id('b2'),
    });
    expect(getPhotoInAlbum('alice', '2026-03-14', id('a'))).toMatchObject({
      n: 1,
      prevId: null,
      nextId: id('b1'),
    });
    expect(getPhotoInAlbum('alice', '2026-03-14', id('c'))).toMatchObject({
      n: 4,
      prevId: id('b2'),
      nextId: null,
    });
    expect(getPhotoInAlbum('alice', '2026-03-15', id('other-day'))).toMatchObject({
      n: 1,
      total: 1,
      prevId: null,
      nextId: null,
    });
  });

  test("is null for another user's photo or a photo from a different day", () => {
    expect(getPhotoInAlbum('bob', '2026-03-14', id('a'))).toBeNull();
    expect(getPhotoInAlbum('alice', '2026-03-14', id('bob'))).toBeNull();
    expect(getPhotoInAlbum('alice', '2026-03-15', id('a'))).toBeNull();
    expect(getPhotoInAlbum('alice', '2026-03-14', id('missing'))).toBeNull();
  });
});
