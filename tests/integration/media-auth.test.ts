import { beforeAll, describe, expect, test } from 'vitest';
import { GET } from '@/app/media/photos/[photoId]/[variant]/route';
import { seedPhotos } from '../../scripts/seed';
import { authedRequest, createUser, freshDb, type TestUser } from './helpers';

let owner: TestUser;
let other: TestUser;
let photoId: string;

const get = (id: string, variant: string, cookie?: string) =>
  GET(authedRequest(`/media/photos/${id}/${variant}`, { cookie }), {
    params: Promise.resolve({ photoId: id, variant }),
  });

beforeAll(async () => {
  await freshDb();
  owner = await createUser();
  other = await createUser();
  const [photo] = await seedPhotos({
    userId: owner.id,
    photos: [{ captureTime: '2026-03-14T09:00:00' }],
  });
  photoId = photo!.id;
});

describe('GET /media/photos/[photoId]/[variant]', () => {
  test('401 without a session', async () => {
    const res = await get(photoId, 'thumb');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  test("another user's photo is indistinguishable from a missing one", async () => {
    const missing = await get('AAAAAAAAAAAAAAAAAAAAAA', 'thumb', other.cookie);
    const missingBody = await missing.json();
    for (const variant of ['thumb', 'full']) {
      const res = await get(photoId, variant, other.cookie);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(missingBody);
    }
    expect(missing.status).toBe(404);
  });

  test('malformed IDs and unknown variants are 404', async () => {
    expect((await get('../../etc/passwd', 'thumb', owner.cookie)).status).toBe(404);
    expect((await get('short', 'thumb', owner.cookie)).status).toBe(404);
    expect((await get(photoId, 'original', owner.cookie)).status).toBe(404);
  });

  test('owner gets the file with caching and type headers', async () => {
    const thumb = await get(photoId, 'thumb', owner.cookie);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get('content-type')).toBe('image/webp');
    expect(thumb.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(thumb.headers.get('x-content-type-options')).toBe('nosniff');
    expect(thumb.headers.get('content-disposition')).toBe('inline');
    expect((await thumb.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const full = await get(photoId, 'full', owner.cookie);
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('image/jpeg');
    const bytes = new Uint8Array(await full.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  });
});
