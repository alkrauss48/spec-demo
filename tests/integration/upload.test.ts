import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, test } from 'vitest';
import { POST } from '@/app/api/photos/route';
import { albumLabel, nowInZone } from '@/lib/dates';
import { getDb } from '@/server/db';
import { fullPath, userDir } from '@/server/media-store';
import { seedPhotos } from '../../scripts/seed';
import { ensureTooBig, fixturePath, MANIFEST, TOO_BIG_BYTES } from '../fixtures/photos/generate';
import {
  APP_ORIGIN,
  createUser,
  fixtureFile,
  freshDb,
  uploadRequest,
  type TestUser,
} from './helpers';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const upload = async (req: Request) => {
  const res = await POST(req);
  const body = (await res.json()) as Json;
  expect(res.headers.get('x-request-id'), 'x-request-id').toBeTruthy();
  return { status: res.status, body };
};

const put = (user: TestUser, name: string, opts: { timezone?: string; as?: string } = {}) =>
  upload(
    uploadRequest(fixtureFile(fixturePath(name), opts.as ?? name), {
      cookie: user.cookie,
      timezone: opts.timezone ?? 'America/Chicago',
    }),
  );

const rowCount = (userId: string) =>
  getDb().prepare('SELECT COUNT(*) FROM photo WHERE user_id = ?').pluck().get(userId) as number;

/** No stray files: exactly a full and a thumb per row, and never a leftover `.tmp`. */
function expectMediaMatchesRows(userId: string) {
  let files: string[] = [];
  try {
    files = readdirSync(userDir(userId));
  } catch {
    // No directory yet means no files.
  }
  expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
  expect(files).toHaveLength(rowCount(userId) * 2);
}

/** A unique, valid JPEG so tests don't collide on duplicate detection. */
let n = 0;
async function uniqueJpeg(date = '2026:05:01 10:00:00') {
  n++;
  return sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: n % 256, g: (n * 7) % 256, b: 99 },
    },
  })
    .jpeg()
    .withExif({ IFD2: { DateTimeOriginal: date } })
    .toBuffer();
}

beforeAll(async () => {
  await freshDb();
});

describe('POST /api/photos: accepted formats and album placement', () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await createUser();
  });

  test('JPEG starts a new album; a second photo that day joins it (US2-AS1, AS2)', async () => {
    const a = await put(user, '2026-03-14_a.jpg');
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      photo: {
        originalFilename: '2026-03-14_a.jpg',
        captureDate: '2026-03-14',
        captureTime: '2026-03-14T09:00:00',
        dateSource: 'exif',
        width: 320,
        height: 240,
      },
      album: { date: '2026-03-14', label: 'Mar 14, 2026', photoCount: 1, created: true },
      usage: { photoCount: 1, photoLimit: 1000 },
    });
    expect(a.body.photo.id).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const b = await put(user, '2026-03-14_b.jpg');
    expect(b.status).toBe(201);
    expect(b.body.album).toEqual({
      date: '2026-03-14',
      label: 'Mar 14, 2026',
      photoCount: 2,
      created: false,
    });
    expect(b.body.usage.photoCount).toBe(2);
  });

  test('PNG, WebP, and HEIC are accepted and dated (FR-008, SC-003)', async () => {
    for (const name of ['2026-03-14_c.png', 'ok.webp', '2026-01-20.heic']) {
      const res = await put(user, name);
      const entry = MANIFEST[name]!;
      expect(res.status, name).toBe(201);
      expect(res.body.photo).toMatchObject({
        captureDate: entry.capture_date,
        dateSource: 'exif',
        width: entry.width,
        height: entry.height,
      });
      expect(res.body.album.label).toBe(albumLabel(entry.capture_date!));
    }
    const heic = getDb()
      .prepare("SELECT format, stored_format FROM photo WHERE user_id = ? AND format = 'heic'")
      .get(user.id);
    expect(heic).toEqual({ format: 'heic', stored_format: 'jpeg' });
  });

  test('every SC-003 reference photo with a valid date lands in its album', async () => {
    const fresh = await createUser();
    for (const [name, entry] of Object.entries(MANIFEST)) {
      if (entry.date_source !== 'exif') continue;
      const res = await put(fresh, name, { timezone: 'Asia/Tokyo' });
      expect(res.status, name).toBe(201);
      expect(res.body.album.date, name).toBe(entry.capture_date);
    }
  });

  test('a photo with no valid date is dated now in the uploader’s zone (US2-AS3, FR-005)', async () => {
    for (const name of ['no-date.jpg', 'future-date.jpg']) {
      const before = nowInZone('Asia/Tokyo').slice(0, 10);
      const res = await put(user, name, { timezone: 'Asia/Tokyo' });
      const after = nowInZone('Asia/Tokyo').slice(0, 10);
      expect(res.status, name).toBe(201);
      expect(res.body.photo.dateSource).toBe('upload');
      expect([before, after]).toContain(res.body.photo.captureDate);
    }
  });

  test('rotated JPEG reports display dimensions (orientation applied)', async () => {
    const res = await put(user, 'gps-serial-comment.jpg');
    expect(res.status).toBe(201);
    expect(res.body.photo).toMatchObject({ width: 240, height: 320 });
  });
});

describe('POST /api/photos: rejections', () => {
  let user: TestUser;
  beforeAll(async () => {
    user = await createUser();
  });

  test('401 without a session', async () => {
    const res = await upload(uploadRequest(fixtureFile(fixturePath('2026-03-14_a.jpg'))));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('403 when Origin is missing or foreign', async () => {
    const file = fixtureFile(fixturePath('2026-03-14_a.jpg'));
    for (const origin of [null, 'https://evil.example', 'http://localhost:3999']) {
      const res = await upload(uploadRequest(file, { cookie: user.cookie, origin }));
      expect(res.status, String(origin)).toBe(403);
      expect(res.body).toEqual({
        code: 'FORBIDDEN_ORIGIN',
        message: 'This request was blocked.',
        fileName: null,
      });
    }
    expect(rowCount(user.id)).toBe(0);
  });

  test('413 for a 51 MB file, rejected up front by Content-Length (FR-009)', async () => {
    await ensureTooBig();
    const res = await upload(
      uploadRequest(fixtureFile(fixturePath('too-big-51mb.jpg')), { cookie: user.cookie }),
    );
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
    expect(res.body.message).toMatch(/larger than the 50 MB limit/);
  });

  test('413 while streaming, before the whole body is read, when there is no Content-Length', async () => {
    const total = 200 * 1024 * 1024; // far past the limit, so stopping early is measurable
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    const boundary = 'x-boundary';
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pano.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n`,
    );
    let sentHead = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sentHead) {
          sentHead = true;
          controller.enqueue(head);
          return;
        }
        if (pulled >= total) {
          controller.close();
          return;
        }
        pulled += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const req = new Request(`${APP_ORIGIN}/api/photos`, {
      method: 'POST',
      headers: {
        cookie: user.cookie,
        origin: APP_ORIGIN,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      duplex: 'half',
    } as RequestInit);
    const res = await upload(req);
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
    expect(pulled).toBeLessThan(total);
    expect(pulled).toBeLessThanOrEqual(TOO_BIG_BYTES + 4 * chunk.length);
  });

  test('415 for a PDF, naming the file (FR-008)', async () => {
    const res = await put(user, 'notes.pdf');
    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      code: 'UNSUPPORTED_TYPE',
      message: "notes.pdf isn't a supported photo. Use JPEG, PNG, HEIC, or WebP.",
      fileName: 'notes.pdf',
    });
    // The name doesn't matter: a PDF called photo.jpg is still rejected.
    expect((await put(user, 'notes.pdf', { as: 'photo.jpg' })).body.code).toBe('UNSUPPORTED_TYPE');
  });

  test('422 for a JPEG that can’t be decoded', async () => {
    const res = await put(user, 'broken.jpg');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      code: 'UNREADABLE_IMAGE',
      message: "broken.jpg couldn't be read as a photo.",
      fileName: 'broken.jpg',
    });
  });

  test('400 without exactly one file part', async () => {
    expect((await upload(uploadRequest(null, { cookie: user.cookie }))).status).toBe(400);
    const two = uploadRequest(fixtureFile(fixturePath('2026-03-14_a.jpg')), {
      cookie: user.cookie,
      extraFiles: [fixtureFile(fixturePath('2026-03-14_b.jpg'))],
    });
    expect((await upload(two)).body.code).toBe('BAD_REQUEST');
  });

  test('409 DUPLICATE on re-upload, even under another name (FR-010)', async () => {
    expect((await put(user, '2026-03-02.jpg')).status).toBe(201);
    const again = await put(user, '2026-03-02.jpg', { as: 'copy.jpg' });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({
      code: 'DUPLICATE',
      message: 'copy.jpg is already in your library, so it was skipped.',
      fileName: 'copy.jpg',
    });
    expect(rowCount(user.id)).toBe(1);
  });

  test('after every rejection nothing is left behind', () => {
    expectMediaMatchesRows(user.id);
  });
});

describe('POST /api/photos: races and the 1,000-photo limit', () => {
  test('998 photos + 5 concurrent uploads → 2 added, 3 rejected at the limit (FR-011, V14)', async () => {
    const user = await createUser();
    await seedPhotos({ userId: user.id, count: 998, albums: 50 });
    const files = await Promise.all(Array.from({ length: 5 }, () => uniqueJpeg()));
    const results = await Promise.all(
      files.map((bytes, i) =>
        upload(
          uploadRequest({ name: `new-${i}.jpg`, bytes }, { cookie: user.cookie, timezone: 'UTC' }),
        ),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 409, 409, 409]);
    for (const r of results.filter((r) => r.status === 409)) {
      expect(r.body.code).toBe('LIBRARY_LIMIT_REACHED');
      expect(r.body.message).toMatch(
        /wasn't added because your library has reached its limit of 1,000 photos\.$/,
      );
    }
    expect(rowCount(user.id)).toBe(1000);
    const last = results
      .filter((r) => r.status === 201)
      .map((r) => r.body.usage.photoCount as number)
      .sort((a, b) => a - b);
    expect(last).toEqual([999, 1000]);
    expectMediaMatchesRows(user.id);
  });

  test('two concurrent identical uploads store exactly one photo', async () => {
    const user = await createUser();
    const bytes = await uniqueJpeg();
    const results = await Promise.all(
      [1, 2].map(() => upload(uploadRequest({ name: 'same.jpg', bytes }, { cookie: user.cookie }))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe('DUPLICATE');
    expect(rowCount(user.id)).toBe(1);
    expectMediaMatchesRows(user.id);
  });
});

describe('POST /api/photos: privacy (FR-015, V9)', () => {
  test('the stored file and the DB row contain none of the forbidden metadata', async () => {
    const user = await createUser();
    const res = await put(user, 'gps-serial-comment.jpg');
    expect(res.status).toBe(201);
    const row = getDb().prepare('SELECT * FROM photo WHERE id = ?').get(res.body.photo.id);
    const stored = readFileSync(fullPath(user.id, res.body.photo.id, 'jpeg')).toString('latin1');
    const thumb = readFileSync(join(userDir(user.id), `${res.body.photo.id}.thumb.webp`)).toString(
      'latin1',
    );
    for (const value of MANIFEST['gps-serial-comment.jpg']!.forbidden!) {
      expect(stored, value).not.toContain(value);
      expect(thumb, value).not.toContain(value);
      expect(JSON.stringify(row), value).not.toContain(value);
    }
    expect(stored).not.toContain('Exif\0\0MM\0*\0\0\0\x08\0\x02'); // only one tag in the kept EXIF
  });

  test('file names have control characters stripped and are cut to 255 chars', async () => {
    const user = await createUser();
    const name = `bad\u0000\u0007name\u001f${'x'.repeat(400)}.jpg`;
    const res = await upload(
      uploadRequest({ name, bytes: await uniqueJpeg() }, { cookie: user.cookie }),
    );
    expect(res.status).toBe(201);
    const stored = res.body.photo.originalFilename as string;
    expect(stored.startsWith('badnamex')).toBe(true);
    expect(stored).toHaveLength(255);
    expect(/[\u0000-\u001f\u007f]/.test(stored)).toBe(false);
  });
});
