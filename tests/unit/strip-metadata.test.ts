import { readFileSync } from 'node:fs';
import exifr from 'exifr';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { stripMetadata } from '@/server/photos/strip-metadata';
import { fixturePath, MANIFEST } from '../fixtures/photos/generate';

const read = (name: string) => readFileSync(fixturePath(name));

/** JPEG marker codes up to SOS, in file order. */
function jpegMarkers(b: Buffer): { marker: number; payload: Buffer }[] {
  const out: { marker: number; payload: Buffer }[] = [];
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    out.push({ marker, payload: b.subarray(i + 4, i + 2 + len) });
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return out;
}

function pngChunks(b: Buffer): string[] {
  const out: string[] = [];
  let i = 8;
  while (i < b.length) {
    const len = b.readUInt32BE(i);
    out.push(b.subarray(i + 4, i + 8).toString('latin1'));
    i += 12 + len;
  }
  return out;
}

function webpChunks(b: Buffer): { id: string; data: Buffer }[] {
  const out: { id: string; data: Buffer }[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const size = b.readUInt32LE(i + 4);
    out.push({
      id: b.subarray(i, i + 4).toString('latin1'),
      data: b.subarray(i + 8, i + 8 + size),
    });
    i += 8 + size + (size & 1);
  }
  return out;
}

const raw = (b: Buffer) => sharp(b).raw().toBuffer({ resolveWithObject: true });

async function expectSamePixels(input: Buffer, output: Buffer) {
  const a = await raw(input);
  const b = await raw(output);
  expect(b.info.width).toBe(a.info.width);
  expect(b.info.height).toBe(a.info.height);
  expect(b.data.equals(a.data)).toBe(true);
}

const PERSONAL_TAGS = [
  'latitude',
  'longitude',
  'GPSLatitude',
  'GPSLongitude',
  'SerialNumber',
  'BodySerialNumber',
  'LensSerialNumber',
  'Artist',
  'Copyright',
  'userComment',
  'UserComment',
  'ImageDescription',
  'MakerNote',
  'creator',
  'Byline',
  'DateTimeOriginal',
];

async function expectNoPersonalMetadata(out: Buffer, name: string) {
  const parsed = ((await exifr.parse(out, {
    gps: true,
    xmp: true,
    iptc: true,
    icc: false,
    mergeOutput: true,
  })) ?? {}) as Record<string, unknown>;
  for (const tag of PERSONAL_TAGS) expect(parsed[tag], `${name}: ${tag}`).toBeUndefined();
  expect(await exifr.thumbnail(out), `${name}: embedded thumbnail`).toBeUndefined();
  const text = out.toString('latin1');
  for (const value of MANIFEST[name]?.forbidden ?? [])
    expect(text, `${name}: "${value}"`).not.toContain(value);
}

const JPEGS = Object.keys(MANIFEST).filter(
  (n) => MANIFEST[n]?.format === 'jpeg' && !['broken.jpg', 'too-big-51mb.jpg'].includes(n),
);

describe('stripJpeg', () => {
  test.each(JPEGS)('%s: no personal metadata, identical pixels', async (name) => {
    const input = read(name);
    const orientation = (await exifr.orientation(input)) ?? 1;
    const out = stripMetadata(input, 'jpeg', orientation);
    await expectNoPersonalMetadata(out, name);
    await expectSamePixels(input, out);

    const markers = jpegMarkers(out).map((m) => m.marker);
    expect(
      markers.filter((m) => m === 0xfe),
      'COM',
    ).toEqual([]);
    expect(
      markers.filter((m) => (m >= 0xe3 && m <= 0xed) || m === 0xef),
      'APP3–APP13, APP15',
    ).toEqual([]);
    expect([out[out.length - 2], out[out.length - 1]]).toEqual([0xff, 0xd9]);
  });

  test('keeps only an Orientation tag when the original is rotated', async () => {
    const input = read('gps-serial-comment.jpg');
    const out = stripMetadata(input, 'jpeg', 6);
    const app1 = jpegMarkers(out).filter((m) => m.marker === 0xe1);
    expect(app1).toHaveLength(1);
    const exif = (await exifr.parse(out, {
      reviveValues: false,
      translateKeys: false,
      translateValues: false,
      mergeOutput: true,
    })) as Record<string, unknown>;
    expect(exif).toEqual({ 0x0112: 6 });
    expect((await sharp(out).metadata()).orientation).toBe(6);
  });

  test('writes no EXIF at all when Orientation is 1', () => {
    const out = stripMetadata(read('2026-03-14_a.jpg'), 'jpeg', 1);
    expect(jpegMarkers(out).filter((m) => m.marker === 0xe1)).toEqual([]);
  });

  test('keeps the Adobe APP14 segment a CMYK JPEG needs to decode', async () => {
    const input = read('cmyk-adobe.jpg');
    const out = stripMetadata(input, 'jpeg', 1);
    const app14 = jpegMarkers(out).filter((m) => m.marker === 0xee);
    expect(app14).toHaveLength(1);
    expect(app14[0]!.payload.subarray(0, 5).toString('latin1')).toBe('Adobe');
    expect((await sharp(out).metadata()).space).toBe('cmyk');
    await expectSamePixels(input, out);
  });

  test('rejects malformed JPEGs', () => {
    expect(() => stripMetadata(read('broken.jpg'), 'jpeg', 1)).toThrow();
    expect(() => stripMetadata(Buffer.from([0xff, 0xd8, 0x00, 0x00]), 'jpeg', 1)).toThrow();
  });
});

describe('stripPng', () => {
  test('drops eXIf, text, and time chunks; pixels are identical', async () => {
    const input = read('2026-03-14_c.png');
    expect(pngChunks(input)).toEqual(expect.arrayContaining(['eXIf', 'tEXt', 'iTXt', 'tIME']));
    const out = stripMetadata(input, 'png', 1);
    const chunks = pngChunks(out);
    for (const c of ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']) expect(chunks).not.toContain(c);
    expect(chunks[0]).toBe('IHDR');
    expect(chunks.at(-1)).toBe('IEND');
    await expectNoPersonalMetadata(out, '2026-03-14_c.png');
    await expectSamePixels(input, out);
  });
});

describe('stripWebp', () => {
  test('drops EXIF and XMP chunks, clears their flags, fixes the RIFF size', async () => {
    const input = read('ok.webp');
    expect(webpChunks(input).map((c) => c.id)).toEqual(expect.arrayContaining(['EXIF', 'XMP ']));
    const out = stripMetadata(input, 'webp', 1);
    const chunks = webpChunks(out);
    expect(chunks.map((c) => c.id)).not.toContain('EXIF');
    expect(chunks.map((c) => c.id)).not.toContain('XMP ');
    const vp8x = chunks.find((c) => c.id === 'VP8X');
    expect(vp8x).toBeDefined();
    expect(vp8x!.data[0]! & 0x0c).toBe(0);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    const text = out.toString('latin1');
    for (const value of MANIFEST['ok.webp']!.forbidden!) expect(text).not.toContain(value);
    await expectSamePixels(input, out);
  });
});
