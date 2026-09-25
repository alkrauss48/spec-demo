import 'server-only';
import { createHash } from 'node:crypto';
import exifr from 'exifr';
import sharp, { type Metadata } from 'sharp';
import { albumLabel, PHOTO_LIMIT } from '@/lib/dates';
import { getDb } from '../db';
import { commit, discard, fullPath, thumbPath, writeTemp, type StoredFormat } from '../media-store';
import { resolveCaptureDate } from './capture-date';
import { convertHeic } from './convert-heic';
import { detectFormat, type UploadFormat } from './detect-format';
import { newPhotoId } from './ids';
import { makeThumb, MAX_INPUT_PIXELS } from './preview';
import { stripMetadata, UnreadableImage } from './strip-metadata';

export type IngestErrorCode =
  'UNSUPPORTED_TYPE' | 'UNREADABLE_IMAGE' | 'DUPLICATE' | 'LIBRARY_LIMIT_REACHED';

export class IngestError extends Error {
  constructor(readonly code: IngestErrorCode) {
    super(code);
    this.name = 'IngestError';
  }
}

export type IngestResult = {
  photo: {
    id: string;
    originalFilename: string;
    captureDate: string;
    captureTime: string;
    dateSource: 'exif' | 'upload';
    width: number;
    height: number;
  };
  album: { date: string; label: string; photoCount: number; created: boolean };
  usage: { photoCount: number; photoLimit: number };
  /** For logging only: the uploaded format and stored size. */
  format: UploadFormat;
  storedBytes: number;
};

/** Control characters stripped, trimmed, at most 255 chars, never empty (data-model.md). */
export function sanitizeFilename(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  return [...clean].slice(0, 255).join('') || 'photo';
}

type Prepared = { stored: Buffer; storedFormat: StoredFormat; width: number; height: number };

async function prepare(bytes: Uint8Array, format: UploadFormat): Promise<Prepared> {
  if (format === 'heic') {
    // Width and height come from the decoded (already upright) image; EXIF Orientation is ignored.
    const { bytes: stored, width, height } = await convertHeic(bytes);
    return { stored, storedFormat: 'jpeg', width, height };
  }
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new UnreadableImage('metadata');
  }
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw new UnreadableImage('dimensions');
  }
  // Only JPEG keeps an Orientation tag (R6), so only JPEG's display size is swapped.
  const orientation =
    format === 'jpeg' ? ((await exifr.orientation(Buffer.from(bytes)).catch(() => 1)) ?? 1) : 1;
  const stored = stripMetadata(bytes, format, orientation);
  const rotated = orientation >= 5 && orientation <= 8;
  return {
    stored,
    storedFormat: format,
    width: rotated ? meta.height : meta.width,
    height: rotated ? meta.width : meta.height,
  };
}

/**
 * Validates, dates, strips, and stores one photo, in the order of data-model.md
 * "Validation rules" and "Lifecycle". Nothing is left behind on failure.
 */
export async function ingestPhoto(input: {
  userId: string;
  bytes: Uint8Array;
  originalFilename: string;
  timezone: string | null | undefined;
}): Promise<IngestResult> {
  const { userId, bytes } = input;
  const format = detectFormat(bytes.subarray(0, 32));
  if (!format) throw new IngestError('UNSUPPORTED_TYPE');

  const db = getDb();
  const sha = createHash('sha256').update(bytes).digest('hex'); // of the original (R8)
  const existing = db.prepare('SELECT 1 FROM photo WHERE user_id = ? AND original_sha256 = ?');
  const count = db.prepare('SELECT COUNT(*) FROM photo WHERE user_id = ?').pluck();
  // Cheap early exits; both are checked again, authoritatively, inside the transaction.
  if (existing.get(userId, sha)) throw new IngestError('DUPLICATE');
  if ((count.get(userId) as number) >= PHOTO_LIMIT) throw new IngestError('LIBRARY_LIMIT_REACHED');

  const date = await resolveCaptureDate(bytes, input.timezone ?? 'UTC');
  let prepared: Prepared;
  let thumb: Buffer;
  try {
    prepared = await prepare(bytes, format);
    thumb = await makeThumb(prepared.stored);
  } catch {
    // The format was recognized, but the stripper, libheif, or sharp couldn't decode it.
    throw new IngestError('UNREADABLE_IMAGE');
  }

  const id = newPhotoId();
  const originalFilename = sanitizeFilename(input.originalFilename);
  const tmp: string[] = [];
  try {
    tmp.push(await writeTemp(userId, prepared.stored), await writeTemp(userId, thumb));

    const insert = db.prepare(
      `INSERT INTO photo (id, user_id, original_filename, format, stored_format, width, height, stored_bytes,
         original_sha256, capture_date, capture_time, date_source, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const albumCount = db
      .prepare('SELECT COUNT(*) FROM photo WHERE user_id = ? AND capture_date = ?')
      .pluck();
    // BEGIN IMMEDIATE takes the write lock first, so concurrent uploads serialize here.
    const { albumBefore, total } = db
      .transaction(() => {
        if (existing.get(userId, sha)) throw new IngestError('DUPLICATE');
        const before = count.get(userId) as number;
        if (before >= PHOTO_LIMIT) throw new IngestError('LIBRARY_LIMIT_REACHED');
        const inAlbum = albumCount.get(userId, date.captureDate) as number;
        try {
          insert.run(
            id,
            userId,
            originalFilename,
            format,
            prepared.storedFormat,
            prepared.width,
            prepared.height,
            prepared.stored.length,
            sha,
            date.captureDate,
            date.captureTime,
            date.dateSource,
            new Date().toISOString(),
          );
        } catch (err) {
          if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE')
            throw new IngestError('DUPLICATE');
          throw err;
        }
        return { albumBefore: inAlbum, total: before + 1 };
      })
      .immediate();

    try {
      await commit(tmp[0]!, fullPath(userId, id, prepared.storedFormat));
      await commit(tmp[1]!, thumbPath(userId, id));
    } catch (err) {
      // The row must not outlive its files.
      db.prepare('DELETE FROM photo WHERE id = ? AND user_id = ?').run(id, userId);
      await discard([fullPath(userId, id, prepared.storedFormat), thumbPath(userId, id)]);
      throw err;
    }
    return {
      photo: {
        id,
        originalFilename,
        captureDate: date.captureDate,
        captureTime: date.captureTime,
        dateSource: date.dateSource,
        width: prepared.width,
        height: prepared.height,
      },
      album: {
        date: date.captureDate,
        label: albumLabel(date.captureDate),
        photoCount: albumBefore + 1,
        created: albumBefore === 0,
      },
      usage: { photoCount: total, photoLimit: PHOTO_LIMIT },
      format,
      storedBytes: prepared.stored.length,
    };
  } finally {
    await discard(tmp);
  }
}
