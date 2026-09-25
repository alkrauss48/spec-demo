/**
 * Generates the reference photo set (SC-003, R15) into this directory.
 *
 *   npx tsx tests/fixtures/photos/generate.ts
 *
 * The HEIC files are made with macOS `sips` when it's available and are committed, so the
 * generator can run elsewhere without them. `too-big-51mb.jpg` is never committed; tests
 * create it with `ensureTooBig()`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import sharp, { type Exif } from 'sharp';

export const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
export const fixturePath = (name: string) => join(FIXTURE_DIR, name);

const XMP = (creator: string) =>
  `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
  `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${creator}</dc:creator>` +
  `</rdf:Description></rdf:RDF></x:xmpmeta>`;

type Rgb = { r: number; g: number; b: number };

/** A two-tone image so orientation and pixel changes are visible. */
async function base(width: number, height: number, top: Rgb, bottom: Rgb) {
  const band = await sharp({
    create: { width, height: Math.round(height / 3), channels: 3, background: top },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 3, background: bottom } }).composite([
    { input: band, top: 0, left: 0 },
  ]);
}

async function jpegWithDate(date: string | null, color: Rgb, extra: Exif = {}) {
  const img = (await base(320, 240, color, { r: 240, g: 240, b: 240 })).jpeg({ quality: 90 });
  const exif: Exif = {
    ...extra,
    IFD2: { ...(extra.IFD2 ?? {}), ...(date ? { DateTimeOriginal: date } : {}) },
  };
  return date || Object.keys(extra).length > 0 ? img.withExif(exif).toBuffer() : img.toBuffer();
}

// --- JPEG segment helpers -------------------------------------------------------------

function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** Inserts segments just before the first DQT marker. */
function insertBeforeDqt(jpeg: Buffer, segments: Buffer[]): Buffer {
  const at = jpeg.indexOf(Buffer.from([0xff, 0xdb]));
  return Buffer.concat([jpeg.subarray(0, at), ...segments, jpeg.subarray(at)]);
}

function iptcApp13(byline: string): Buffer {
  const text = Buffer.from(byline, 'latin1');
  const dataset = Buffer.concat([Buffer.from([0x1c, 0x02, 0x50]), u16be(text.length), text]);
  const resource = Buffer.concat([
    Buffer.from('8BIM', 'latin1'),
    u16be(0x0404),
    Buffer.from([0, 0]), // empty Pascal name, padded to even
    u32be(dataset.length),
    dataset,
    dataset.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),
  ]);
  return segment(0xed, Buffer.concat([Buffer.from('Photoshop 3.0\0', 'latin1'), resource]));
}

/** The TIFF payload of a JPEG's APP1 EXIF segment. */
function exifTiffFrom(jpeg: Buffer): Buffer {
  const at = jpeg.indexOf(Buffer.from('Exif\0\0', 'latin1'));
  const len = jpeg.readUInt16BE(at - 2);
  return jpeg.subarray(at + 6, at - 2 + len);
}

const u16be = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const u32be = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

// --- PNG chunk helpers ----------------------------------------------------------------

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = u32be(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([u32be(data.length), typeBuf, data, crc]);
}

function insertBeforeIdat(png: Buffer, chunks: Buffer[]): Buffer {
  const at = png.indexOf(Buffer.from('IDAT', 'latin1')) - 4;
  return Buffer.concat([png.subarray(0, at), ...chunks, png.subarray(at)]);
}

// --- Manifest -------------------------------------------------------------------------

export type FixtureEntry = {
  /** Expected album date, or null when the upload-date fallback applies. */
  capture_date: string | null;
  capture_time?: string;
  date_source: 'exif' | 'upload' | null;
  format: 'jpeg' | 'png' | 'webp' | 'heic' | null;
  /** Display dimensions after orientation, for images. */
  width?: number;
  height?: number;
  /** Strings that must not appear in any stored file, DB row, or log line. */
  forbidden?: string[];
};

const FORBIDDEN = [
  'Jane Owner',
  'SN-998877',
  'LENS-4455',
  'secret comment',
  'XMP Creator',
  'IPTC Byline',
];

export const MANIFEST: Record<string, FixtureEntry> = {
  '2026-03-14_a.jpg': {
    capture_date: '2026-03-14',
    capture_time: '2026-03-14T09:00:00',
    date_source: 'exif',
    format: 'jpeg',
    width: 320,
    height: 240,
  },
  '2026-03-14_b.jpg': {
    capture_date: '2026-03-14',
    capture_time: '2026-03-14T10:00:00',
    date_source: 'exif',
    format: 'jpeg',
    width: 320,
    height: 240,
  },
  '2026-03-02.jpg': {
    capture_date: '2026-03-02',
    capture_time: '2026-03-02T12:00:00',
    date_source: 'exif',
    format: 'jpeg',
    width: 320,
    height: 240,
  },
  '2026-03-14_c.png': {
    capture_date: '2026-03-14',
    capture_time: '2026-03-14T11:00:00',
    date_source: 'exif',
    format: 'png',
    width: 320,
    height: 240,
    forbidden: ['Jane Owner', 'XMP Creator'],
  },
  'ok.webp': {
    capture_date: '2026-02-10',
    capture_time: '2026-02-10T08:00:00',
    date_source: 'exif',
    format: 'webp',
    width: 320,
    height: 240,
    forbidden: ['Jane Owner', 'XMP Creator'],
  },
  '2026-03-14_2330.jpg': {
    capture_date: '2026-03-14',
    capture_time: '2026-03-14T23:30:00',
    date_source: 'exif',
    format: 'jpeg',
    width: 320,
    height: 240,
  },
  'no-date.jpg': {
    capture_date: null,
    date_source: 'upload',
    format: 'jpeg',
    width: 320,
    height: 240,
  },
  'future-date.jpg': {
    capture_date: null,
    date_source: 'upload',
    format: 'jpeg',
    width: 320,
    height: 240,
  },
  'pre-1900.jpg': {
    capture_date: null,
    date_source: 'upload',
    format: 'jpeg',
    width: 320,
    height: 240,
  },
  // Orientation 6: stored 320×240, displayed 240×320.
  'gps-serial-comment.jpg': {
    capture_date: '2026-03-14',
    capture_time: '2026-03-14T12:34:56',
    date_source: 'exif',
    format: 'jpeg',
    width: 240,
    height: 320,
    forbidden: FORBIDDEN,
  },
  'too-big-51mb.jpg': { capture_date: null, date_source: null, format: 'jpeg' },
  'broken.jpg': { capture_date: null, date_source: null, format: 'jpeg' },
  'cmyk-adobe.jpg': {
    capture_date: null,
    date_source: 'upload',
    format: 'jpeg',
    width: 160,
    height: 120,
  },
  'notes.pdf': { capture_date: null, date_source: null, format: null },
  '2026-01-20.heic': {
    capture_date: '2026-01-20',
    capture_time: '2026-01-20T14:15:00',
    date_source: 'exif',
    format: 'heic',
    width: 256,
    height: 192,
  },
  // irot + EXIF Orientation 6 on a 120×80 image: displayed 80×120 (portrait).
  '2026-01-21-rotated.heic': {
    capture_date: '2026-01-21',
    capture_time: '2026-01-21T08:30:00',
    date_source: 'exif',
    format: 'heic',
    width: 80,
    height: 120,
  },
};

export const TOO_BIG_BYTES = 51 * 1024 * 1024;

/** Creates `too-big-51mb.jpg` (a real JPEG padded after EOI) if it doesn't exist yet. */
export async function ensureTooBig(): Promise<string> {
  const path = fixturePath('too-big-51mb.jpg');
  if (!existsSync(path)) {
    const jpeg = await jpegWithDate('2026:03:14 08:00:00', { r: 10, g: 10, b: 10 });
    writeFileSync(path, Buffer.concat([jpeg, Buffer.alloc(TOO_BIG_BYTES - jpeg.length)]));
  }
  return path;
}

// --- Generation -----------------------------------------------------------------------

async function generate() {
  const write = (name: string, bytes: Buffer) => writeFileSync(fixturePath(name), bytes);

  write('2026-03-14_a.jpg', await jpegWithDate('2026:03:14 09:00:00', { r: 200, g: 40, b: 40 }));
  write('2026-03-14_b.jpg', await jpegWithDate('2026:03:14 10:00:00', { r: 40, g: 160, b: 60 }));
  write('2026-03-02.jpg', await jpegWithDate('2026:03:02 12:00:00', { r: 40, g: 60, b: 200 }));
  // An offset tag that would push the photo to Mar 15 in Tokyo if it were applied (V6).
  write(
    '2026-03-14_2330.jpg',
    await jpegWithDate(
      '2026:03:14 23:30:00',
      { r: 120, g: 40, b: 160 },
      { IFD2: { OffsetTimeOriginal: '-05:00' } },
    ),
  );
  write('no-date.jpg', await jpegWithDate(null, { r: 200, g: 200, b: 40 }));
  write('future-date.jpg', await jpegWithDate('2099:01:01 10:00:00', { r: 40, g: 200, b: 200 }));
  write('pre-1900.jpg', await jpegWithDate('1850:06:01 10:00:00', { r: 150, g: 90, b: 30 }));

  const gps = await (
    await base(320, 240, { r: 220, g: 120, b: 20 }, { r: 30, g: 30, b: 30 })
  )
    .jpeg({ quality: 90 })
    .withExif({
      IFD0: {
        Artist: 'Jane Owner',
        Copyright: 'Jane Owner 2026',
        ImageDescription: 'secret comment',
      },
      IFD2: {
        DateTimeOriginal: '2026:03:14 12:34:56',
        BodySerialNumber: 'SN-998877',
        LensSerialNumber: 'LENS-4455',
        UserComment: 'secret comment',
      },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '41/1 24/1 1234/100',
        GPSLongitudeRef: 'W',
        GPSLongitude: '2/1 10/1 2600/100',
      },
    })
    .withMetadata({ orientation: 6 })
    .withXmp(XMP('XMP Creator'))
    .toBuffer();
  write(
    'gps-serial-comment.jpg',
    insertBeforeDqt(gps, [
      iptcApp13('IPTC Byline'),
      segment(0xfe, Buffer.from('secret comment', 'latin1')),
    ]),
  );

  const cmyk = await (
    await base(160, 120, { r: 0, g: 130, b: 20 }, { r: 250, g: 250, b: 250 })
  )
    .toColourspace('cmyk')
    .jpeg({ quality: 90 })
    .toBuffer();
  if (!cmyk.includes(Buffer.from('Adobe', 'latin1')))
    throw new Error('CMYK JPEG has no Adobe APP14');
  write('cmyk-adobe.jpg', cmyk);

  // Valid SOI and the start of APP0, then nothing: detected as JPEG, can't be decoded.
  write('broken.jpg', (await jpegWithDate(null, { r: 1, g: 2, b: 3 })).subarray(0, 24));

  // PNG with eXIf (from a JPEG's EXIF), tEXt, iTXt (XMP), and tIME chunks.
  const pngExif = exifTiffFrom(
    await jpegWithDate(
      '2026:03:14 11:00:00',
      { r: 0, g: 0, b: 0 },
      { IFD0: { Artist: 'Jane Owner' } },
    ),
  );
  const png = await (
    await base(320, 240, { r: 250, g: 180, b: 0 }, { r: 20, g: 20, b: 120 })
  )
    .png()
    .toBuffer();
  write(
    '2026-03-14_c.png',
    insertBeforeIdat(png, [
      pngChunk('eXIf', pngExif),
      pngChunk('tEXt', Buffer.from('Author\0Jane Owner', 'latin1')),
      pngChunk(
        'iTXt',
        Buffer.concat([
          Buffer.from('XML:com.adobe.xmp\0\0\0\0\0', 'latin1'),
          Buffer.from(XMP('XMP Creator')),
        ]),
      ),
      pngChunk('tIME', Buffer.from([0x07, 0xea, 3, 14, 11, 0, 0])),
    ]),
  );

  write(
    'ok.webp',
    await (
      await base(320, 240, { r: 90, g: 20, b: 120 }, { r: 200, g: 230, b: 250 })
    )
      .webp({ quality: 90 })
      .withExif({
        IFD0: { Artist: 'Jane Owner' },
        IFD2: { DateTimeOriginal: '2026:02:10 08:00:00' },
      })
      .withXmp(XMP('XMP Creator'))
      .toBuffer(),
  );

  write(
    'notes.pdf',
    Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
        '2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
      'latin1',
    ),
  );

  await generateHeic();
  writeFileSync(fixturePath('manifest.json'), JSON.stringify(MANIFEST, null, 2) + '\n');
}

/** HEIC needs an encoder; macOS `sips` (ImageIO) writes real HEVC with `irot` boxes. */
async function generateHeic() {
  let hasSips = false;
  try {
    execFileSync('sips', ['--version'], { stdio: 'ignore' });
    hasSips = true;
  } catch {
    // Not macOS.
  }
  if (!hasSips) {
    for (const name of ['2026-01-20.heic', '2026-01-21-rotated.heic']) {
      if (!existsSync(fixturePath(name)))
        throw new Error(`${name} is missing and sips isn't available`);
    }
    return;
  }
  const tmp = fixturePath('.heic-src.jpg');
  const sips = (out: string) => {
    execFileSync(
      'sips',
      ['-s', 'format', 'heic', '-s', 'formatOptions', '90', tmp, '--out', fixturePath(out)],
      {
        stdio: 'ignore',
      },
    );
  };

  // A gradient so the PSNR comparison in convert-heic.test.ts has real detail to measure.
  const w = 256;
  const h = 192;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = x;
      raw[i + 1] = Math.round((y / h) * 255);
      raw[i + 2] = (x + y) % 256;
    }
  }
  writeFileSync(
    tmp,
    await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
      .withExif({ IFD2: { DateTimeOriginal: '2026:01:20 14:15:00' } })
      .toBuffer(),
  );
  sips('2026-01-20.heic');

  writeFileSync(
    tmp,
    await (
      await base(120, 80, { r: 230, g: 20, b: 20 }, { r: 20, g: 20, b: 230 })
    )
      .jpeg({ quality: 95 })
      .withExif({ IFD2: { DateTimeOriginal: '2026:01:21 08:30:00' } })
      .withMetadata({ orientation: 6 })
      .toBuffer(),
  );
  sips('2026-01-21-rotated.heic');
  execFileSync('rm', ['-f', tmp]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generate().then(
    () => console.log('Fixtures written to', FIXTURE_DIR),
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
