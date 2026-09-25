import 'server-only';
import exifr from 'exifr';
import { nowInZone } from '@/lib/dates';
import { detectFormat } from './detect-format';
import { webpExif } from './strip-metadata';

export type CaptureDate = {
  captureDate: string;
  captureTime: string;
  dateSource: 'exif' | 'upload';
};

const EXIF_DATE_RE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const EARLIEST = '1900-01-01T00:00:00';

let zones: Set<string> | undefined;

/** A valid IANA zone name, else UTC (data-model.md rule 8). */
export function validZone(timezone: string | null | undefined): string {
  if (!timezone) return 'UTC';
  zones ??= new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
  if (zones.has(timezone)) return timezone;
  try {
    // Accept aliases (e.g. "Asia/Calcutta") that the canonical list leaves out.
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** `YYYY:MM:DD HH:mm:ss` as local wall-clock time `YYYY-MM-DDTHH:mm:ss`, or null. */
function parseExifDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = EXIF_DATE_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  const date = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!, s!));
  const real =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo! - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s;
  return real ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

async function readDates(
  bytes: Uint8Array,
): Promise<{ DateTimeOriginal?: unknown; CreateDate?: unknown }> {
  // exifr can't read the WebP container, so hand it the EXIF chunk's TIFF payload.
  const input = detectFormat(bytes.subarray(0, 32)) === 'webp' ? webpExif(bytes) : bytes;
  if (!input) return {};
  try {
    return (
      (await exifr.parse(Buffer.from(input.buffer, input.byteOffset, input.byteLength), {
        pick: ['DateTimeOriginal', 'CreateDate'],
        reviveValues: false,
      })) ?? {}
    );
  } catch {
    return {};
  }
}

/**
 * The photo's local capture time from its original bytes, read as wall-clock time with
 * offsets ignored; or now in the uploader's zone when there's no valid date (FR-005, R7).
 */
export async function resolveCaptureDate(
  originalBytes: Uint8Array,
  timezone: string,
  now: Date = new Date(),
): Promise<CaptureDate> {
  const localNow = nowInZone(validZone(timezone), now);
  const tags = await readDates(originalBytes);
  // A present-but-invalid DateTimeOriginal means no valid date; CreateDate is only for when it's absent.
  const recorded = parseExifDate(tags.DateTimeOriginal ?? tags.CreateDate);
  if (recorded && recorded >= EARLIEST && recorded <= localNow) {
    return { captureDate: recorded.slice(0, 10), captureTime: recorded, dateSource: 'exif' };
  }
  return { captureDate: localNow.slice(0, 10), captureTime: localNow, dateSource: 'upload' };
}
