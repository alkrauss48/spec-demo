import 'server-only';

// Lossless, allow-list metadata removal for JPEG, PNG, and WebP (FR-015, R6). The file is
// rewritten keeping only the segments or chunks needed to decode and display the image.
// Pixel data is copied byte for byte and never decoded or re-encoded.

export class UnreadableImage extends Error {
  constructor(detail: string) {
    super(`Unreadable image: ${detail}`);
    this.name = 'UnreadableImage';
  }
}

// --- JPEG -----------------------------------------------------------------------------

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP2 = 0xe2;
const APP14 = 0xee;

/** Table and frame markers kept as they are: DQT, DHT, DAC, DRI, DNL, DHP, EXP, and SOF0–15. */
function isImageDataMarker(m: number): boolean {
  if (
    m === 0xdb ||
    m === 0xc4 ||
    m === 0xcc ||
    m === 0xdd ||
    m === 0xdc ||
    m === 0xde ||
    m === 0xdf
  )
    return true;
  return m >= 0xc0 && m <= 0xcf && m !== 0xc8; // SOFn; 0xC8 (JPG) is reserved
}

const startsWith = (b: Uint8Array, text: string) =>
  b.length >= text.length && [...text].every((ch, i) => b[i] === ch.charCodeAt(0));

/** A minimal big-endian APP1 EXIF segment whose IFD0 holds only the Orientation tag. */
function orientationApp1(orientation: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x0112, 10); // Orientation
  tiff.writeUInt16BE(3, 12); // SHORT
  tiff.writeUInt32BE(1, 14); // count
  tiff.writeUInt16BE(orientation, 18); // value, left-justified in the 4-byte field
  tiff.writeUInt32BE(0, 22); // no next IFD
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/**
 * Keeps SOI, JFIF APP0 (without its thumbnail), ICC APP2, Adobe APP14, the tables and frame
 * headers, and the scans up to EOI. Drops APP1 (EXIF/XMP), APP3–APP13 (incl. IPTC), APP15,
 * COM, and anything after EOI. Writes a fresh Orientation-only APP1 when orientation ≠ 1.
 */
export function stripJpeg(bytes: Uint8Array, orientation: number): Buffer {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) throw new UnreadableImage('missing SOI');
  const out: Buffer[] = [Buffer.from([0xff, SOI])];
  let app0: Buffer | undefined;
  let sawFrame = false;
  let i = 2;

  const segmentAt = (at: number) => {
    if (at + 4 > b.length) throw new UnreadableImage('truncated segment header');
    const len = b.readUInt16BE(at + 2);
    if (len < 2 || at + 2 + len > b.length) throw new UnreadableImage('bad segment length');
    return { end: at + 2 + len, payload: b.subarray(at + 4, at + 2 + len) };
  };

  for (;;) {
    if (i + 2 > b.length) throw new UnreadableImage('missing EOI');
    if (b[i] !== 0xff) throw new UnreadableImage('expected a marker');
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === EOI) {
      out.push(Buffer.from([0xff, EOI]));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // TEM and stray RSTn carry no data
      continue;
    }
    const { end, payload } = segmentAt(i);

    if (marker === SOS) {
      if (!sawFrame) throw new UnreadableImage('scan before frame header');
      // Entropy-coded data runs to the next marker that isn't stuffing (FF00) or RSTn.
      let j = end;
      while (j + 1 < b.length) {
        if (b[j] === 0xff) {
          const next = b[j + 1]!;
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7) && next !== 0xff) break;
        }
        j++;
      }
      if (j + 1 >= b.length) throw new UnreadableImage('truncated scan');
      out.push(b.subarray(i, j));
      i = j;
      continue;
    }

    if (marker === APP0 && startsWith(payload, 'JFIF\0') && payload.length >= 14) {
      // Keep the JFIF header, but zero the optional embedded thumbnail's size and drop it.
      const header = Buffer.from(payload.subarray(0, 14));
      header[12] = 0;
      header[13] = 0;
      const seg = Buffer.concat([Buffer.from([0xff, APP0, 0, 16]), header]);
      app0 ??= seg;
      out.push(seg);
    } else if (marker === APP2 && startsWith(payload, 'ICC_PROFILE\0')) {
      out.push(b.subarray(i, end));
    } else if (marker === APP14 && startsWith(payload, 'Adobe')) {
      out.push(b.subarray(i, end));
    } else if (isImageDataMarker(marker)) {
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xcc) sawFrame = true;
      out.push(b.subarray(i, end));
    }
    // Everything else (APP1, APP3–APP13, APP15, COM, JPGn, other APP0/APP2/APP14) is dropped.
    i = end;
  }

  if (!sawFrame) throw new UnreadableImage('no frame header');
  if (orientation !== 1) {
    const at = app0 ? out.indexOf(app0) + 1 : 1;
    out.splice(at, 0, orientationApp1(orientation));
  }
  return Buffer.concat(out);
}

// --- PNG ------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'pHYs',
  'bKGD',
]);

/** Keeps only the allow-listed chunks, copied with their original CRCs. */
export function stripPng(bytes: Uint8Array): Buffer {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 8 || !b.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new UnreadableImage('bad PNG signature');
  const out: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  let sawEnd = false;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const end = i + 12 + len;
    if (end > b.length) throw new UnreadableImage('truncated PNG chunk');
    const type = b.subarray(i + 4, i + 8).toString('latin1');
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) throw new UnreadableImage('missing IEND');
  return Buffer.concat(out);
}

// --- WebP -----------------------------------------------------------------------------

const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP', 'ANIM', 'ANMF']);
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

type RiffChunk = { id: string; start: number; end: number; data: Buffer };

function riffChunks(b: Buffer): RiffChunk[] {
  if (
    b.length < 12 ||
    b.toString('latin1', 0, 4) !== 'RIFF' ||
    b.toString('latin1', 8, 12) !== 'WEBP'
  ) {
    throw new UnreadableImage('bad WebP header');
  }
  const chunks: RiffChunk[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const size = b.readUInt32LE(i + 4);
    const dataEnd = i + 8 + size;
    if (dataEnd > b.length) throw new UnreadableImage('truncated WebP chunk');
    const end = Math.min(dataEnd + (size & 1), b.length);
    chunks.push({
      id: b.toString('latin1', i, i + 4),
      start: i,
      end,
      data: b.subarray(i + 8, dataEnd),
    });
    i = end;
  }
  return chunks;
}

/** Drops EXIF and XMP chunks, clears their VP8X flags, and rewrites the RIFF size. */
export function stripWebp(bytes: Uint8Array): Buffer {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Buffer[] = [];
  for (const chunk of riffChunks(b)) {
    if (!WEBP_KEEP.has(chunk.id)) continue;
    // Header and data as they are, plus the even-length pad byte (added if the file lacked it).
    const raw = Buffer.concat([
      b.subarray(chunk.start, chunk.start + 8 + chunk.data.length),
      Buffer.alloc(chunk.data.length & 1),
    ]);
    if (chunk.id === 'VP8X') raw[8] = raw[8]! & ~(VP8X_EXIF | VP8X_XMP);
    parts.push(raw);
  }
  if (!parts.some((p) => ['VP8 ', 'VP8L', 'ANMF'].includes(p.toString('latin1', 0, 4)))) {
    throw new UnreadableImage('no WebP image data');
  }
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

/** The TIFF payload of a WebP's EXIF chunk (which exifr can't find itself), if any. */
export function webpExif(bytes: Uint8Array): Buffer | null {
  let chunks: RiffChunk[];
  try {
    chunks = riffChunks(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    return null;
  }
  const exif = chunks.find((c) => c.id === 'EXIF')?.data;
  if (!exif) return null;
  return startsWith(exif, 'Exif\0\0') ? exif.subarray(6) : exif;
}

// --- Dispatcher -----------------------------------------------------------------------

export function stripMetadata(
  bytes: Uint8Array,
  format: 'jpeg' | 'png' | 'webp',
  orientation: number,
): Buffer {
  switch (format) {
    case 'jpeg':
      return stripJpeg(bytes, orientation);
    case 'png':
      return stripPng(bytes);
    case 'webp':
      return stripWebp(bytes);
  }
}
