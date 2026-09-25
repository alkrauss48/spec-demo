import 'server-only';
import { PHOTO_LIMIT, albumLabel, groupLabel } from '@/lib/dates';
import { getDb } from '../db';
import type { StoredFormat } from '../media-store';

/** The photo's ID and stored format, only if `userId` owns it (FR-014). */
export function getOwnedPhoto(
  userId: string,
  photoId: string,
): { id: string; stored_format: StoredFormat } | undefined {
  return getDb()
    .prepare('SELECT id, stored_format FROM photo WHERE id = ? AND user_id = ?')
    .get(photoId, userId) as { id: string; stored_format: StoredFormat } | undefined;
}

// --- Test hooks (T049) ----------------------------------------------------------------
// Read at request time and gated on E2E_TEST_HOOKS, which only the Playwright servers set.
// Not gated on NODE_ENV: Playwright runs `next start`, which is production mode.

const testHooks = () => process.env.E2E_TEST_HOOKS === '1';

/** Throws when the error-state test server asks every photo query to fail. */
export function maybeFailForTest(): void {
  if (testHooks() && process.env.E2E_FAIL_DB === '1') {
    throw new Error('Simulated database failure (E2E_FAIL_DB)');
  }
}

/** Waits for the `x-e2e-delay-ms` request header (≤ 10 s) so loading states can be observed. */
export async function maybeDelayForTest(headers: Headers): Promise<void> {
  if (!testHooks()) return;
  const ms = Math.min(Number(headers.get('x-e2e-delay-ms') ?? 0) || 0, 10_000);
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Library (US1) --------------------------------------------------------------------

export type Preview = { id: string; width: number; height: number };
export type AlbumSummary = { date: string; label: string; photoCount: number; previews: Preview[] };
export type DateGroup = { yearMonth: string; label: string; albums: AlbumSummary[] };

/** Albums grouped by month, both newest first, each with its ≤ 4 earliest photos (FR-001–003). */
export function getLibraryGroups(userId: string): DateGroup[] {
  maybeFailForTest();
  const db = getDb();
  const albums = db
    .prepare(
      `SELECT capture_date AS date, COUNT(*) AS photoCount
         FROM photo WHERE user_id = ?
        GROUP BY capture_date
        ORDER BY capture_date DESC`,
    )
    .all(userId) as { date: string; photoCount: number }[];
  const previews = db
    .prepare(
      `SELECT id, width, height, capture_date AS date FROM (
         SELECT id, width, height, capture_date,
                ROW_NUMBER() OVER (PARTITION BY capture_date ORDER BY capture_time, added_at, id) AS rn
           FROM photo WHERE user_id = ?
       ) WHERE rn <= 4
       ORDER BY capture_date, rn`,
    )
    .all(userId) as (Preview & { date: string })[];

  const byDate = new Map<string, Preview[]>();
  for (const { date, ...preview } of previews) {
    const list = byDate.get(date) ?? [];
    list.push(preview);
    byDate.set(date, list);
  }

  const groups: DateGroup[] = [];
  for (const album of albums) {
    const yearMonth = album.date.slice(0, 7);
    let group = groups.at(-1);
    if (group?.yearMonth !== yearMonth) {
      group = { yearMonth, label: groupLabel(yearMonth), albums: [] };
      groups.push(group);
    }
    group.albums.push({
      date: album.date,
      label: albumLabel(album.date),
      photoCount: album.photoCount,
      previews: byDate.get(album.date) ?? [],
    });
  }
  return groups;
}

export function getUsage(userId: string): { photoCount: number; photoLimit: number } {
  maybeFailForTest();
  const photoCount = getDb()
    .prepare('SELECT COUNT(*) FROM photo WHERE user_id = ?')
    .pluck()
    .get(userId) as number;
  return { photoCount, photoLimit: PHOTO_LIMIT };
}

// --- Album and viewer (US3) -----------------------------------------------------------

export type AlbumPhoto = {
  id: string;
  width: number;
  height: number;
  captureTime: string;
  dateSource: 'exif' | 'upload';
  addedAt: string;
  n: number;
  total: number;
};

export type ViewerPhoto = AlbumPhoto & { prevId: string | null; nextId: string | null };

const ALBUM_ROWS = `
  SELECT id, width, height, capture_time AS captureTime, date_source AS dateSource, added_at AS addedAt,
         ROW_NUMBER() OVER w AS n,
         COUNT(*) OVER () AS total,
         LAG(id) OVER w AS prevId,
         LEAD(id) OVER w AS nextId
    FROM photo
   WHERE user_id = ? AND capture_date = ?
  WINDOW w AS (ORDER BY capture_time, added_at, id)`;

/** One user's photos for one day, oldest first (FR-012). Empty for anyone else's day. */
export function getAlbumPhotos(userId: string, date: string): AlbumPhoto[] {
  maybeFailForTest();
  const rows = getDb().prepare(`${ALBUM_ROWS} ORDER BY n`).all(userId, date) as ViewerPhoto[];
  return rows.map((row) => {
    const photo: AlbumPhoto & Partial<Pick<ViewerPhoto, 'prevId' | 'nextId'>> = { ...row };
    delete photo.prevId;
    delete photo.nextId;
    return photo;
  });
}

/** A photo in this user's album for `date`, with its neighbors; null if it isn't there (FR-014). */
export function getPhotoInAlbum(userId: string, date: string, photoId: string): ViewerPhoto | null {
  maybeFailForTest();
  const row = getDb()
    .prepare(`SELECT * FROM (${ALBUM_ROWS}) WHERE id = ?`)
    .get(userId, date, photoId) as ViewerPhoto | undefined;
  return row ?? null;
}

/** Whether this user has an album (at least one photo) for `date`. */
export function albumExists(userId: string, date: string): boolean {
  maybeFailForTest();
  return !!getDb()
    .prepare('SELECT 1 FROM photo WHERE user_id = ? AND capture_date = ? LIMIT 1')
    .get(userId, date);
}
