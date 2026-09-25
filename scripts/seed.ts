/**
 * Seeds a user's library with generated photos (quickstart V14 and the perf checks).
 *
 *   npm run seed -- --user perf@example.test --photos 1000 --albums 100 [--start 2026-03-14]
 *   npm run seed -- --user a@example.test --photos-json '[{"captureTime":"2026-03-14T09:00:00"}]' --json
 */
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { getAuth } from '../src/server/auth';
import { getDb } from '../src/server/db';
import { commit, fullPath, thumbPath, writeTemp } from '../src/server/media-store';
import { newPhotoId } from '../src/server/photos/ids';
import { makeThumb } from '../src/server/photos/preview';

export type SeedPhoto = { captureTime: string; dateSource?: 'exif' | 'upload' };
export type SeedOptions =
  | { userId: string; count: number; albums?: number; start?: string }
  | { userId: string; photos: SeedPhoto[] };
export type SeededPhoto = { id: string; captureTime: string; dateSource: 'exif' | 'upload' };

const WIDTH = 640;
const HEIGHT = 480;
const MAX_PHOTOS = 1000;

/** Creates the user if they don't exist yet and returns their ID. */
export async function ensureUser(
  email: string,
  password = process.env.SEED_PASSWORD ?? 'password1234',
) {
  const existing = getDb()
    .prepare('SELECT id FROM user WHERE email = ?')
    .get(email.toLowerCase()) as { id: string } | undefined;
  if (existing) return existing.id;
  const { user } = await getAuth().api.signUpEmail({
    body: { email, password, name: email.split('@')[0] ?? 'seed' },
  });
  return user.id;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `count` photos spread over `albums` consecutive days ending at `start`. */
function plan(count: number, albums: number, start: string): SeedPhoto[] {
  const photos: SeedPhoto[] = [];
  for (let i = 0; i < count; i++) {
    const day = i % albums;
    const nth = Math.floor(i / albums);
    const seconds = 8 * 3600 + nth * 30; // 30 s apart from 08:00, so 1,000 fit in a day
    const pad = (n: number) => String(n).padStart(2, '0');
    const time = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
    photos.push({ captureTime: `${addDays(start, -day)}T${time}` });
  }
  return photos;
}

/** A distinct solid-color JPEG per index (distinct bytes, so distinct hashes). */
function colorFor(i: number, salt: number) {
  return {
    r: (i * 37 + salt) % 256,
    g: (Math.floor(i / 7) * 53 + salt * 3) % 256,
    b: (i * 11 + 97) % 256,
  };
}

async function runPool<T>(items: T[], size: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await fn(items[index] as T, index);
      }
    }),
  );
}

export async function seedPhotos(opts: SeedOptions): Promise<SeededPhoto[]> {
  const list =
    'photos' in opts
      ? opts.photos
      : plan(
          opts.count,
          Math.max(1, opts.albums ?? Math.ceil(opts.count / 10)),
          opts.start ?? '2026-03-14',
        );
  const db = getDb();
  const existing =
    (db
      .prepare('SELECT COUNT(*) FROM photo WHERE user_id = ?')
      .pluck()
      .get(opts.userId) as number) ?? 0;
  if (existing + list.length > MAX_PHOTOS) {
    throw new Error(`Seeding ${list.length} photos would exceed the ${MAX_PHOTOS}-photo limit`);
  }
  const salt = Math.floor(Math.random() * 1_000_000);
  const insert = db.prepare(
    `INSERT INTO photo (id, user_id, original_filename, format, stored_format, width, height, stored_bytes,
       original_sha256, capture_date, capture_time, date_source, added_at)
     VALUES (?, ?, ?, 'jpeg', 'jpeg', ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const seeded: SeededPhoto[] = new Array(list.length);
  const rows: unknown[][] = new Array(list.length);
  const files: [string, string][] = [];

  // Files are prepared first and all rows go in one short transaction, so seeding holds the
  // write lock only briefly while a server is using the same database.
  await runPool(list, 8, async (photo, i) => {
    const full = await sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 3,
        background: colorFor(existing + i, salt),
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    // Two photos can still share a color across separate seed runs; salt the hash input.
    const sha = createHash('sha256').update(full).update(`${salt}:${i}`).digest('hex');
    const thumb = await makeThumb(full);
    const id = newPhotoId();
    const dateSource = photo.dateSource ?? 'exif';
    const addedAt =
      dateSource === 'upload' ? `${photo.captureTime}.000Z` : new Date().toISOString();
    const [tmpFull, tmpThumb] = await Promise.all([
      writeTemp(opts.userId, full),
      writeTemp(opts.userId, thumb),
    ]);
    files.push(
      [tmpFull, fullPath(opts.userId, id, 'jpeg')],
      [tmpThumb, thumbPath(opts.userId, id)],
    );
    rows[i] = [
      id,
      opts.userId,
      `seed-${i + 1}.jpg`,
      WIDTH,
      HEIGHT,
      full.length,
      sha,
      photo.captureTime.slice(0, 10),
      photo.captureTime,
      dateSource,
      addedAt,
    ];
    seeded[i] = { id, captureTime: photo.captureTime, dateSource };
  });
  db.transaction(() => {
    for (const row of rows) insert.run(...row);
  }).immediate();
  await Promise.all(files.map(([tmp, final]) => commit(tmp, final)));
  return seeded;
}

async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: 'string' },
      photos: { type: 'string' },
      albums: { type: 'string' },
      start: { type: 'string' },
      'photos-json': { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });
  if (!values.user) throw new Error('--user <email> is required');
  const userId = await ensureUser(values.user);
  const seeded = values['photos-json']
    ? await seedPhotos({ userId, photos: JSON.parse(values['photos-json']) as SeedPhoto[] })
    : await seedPhotos({
        userId,
        count: Number(values.photos ?? '0'),
        albums: values.albums ? Number(values.albums) : undefined,
        start: values.start,
      });
  if (values.json) {
    process.stdout.write(JSON.stringify({ userId, photos: seeded }) + '\n');
  } else {
    console.log(`Seeded ${seeded.length} photos for the user`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
