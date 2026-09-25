import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { detectFormat } from '@/server/photos/detect-format';
import { fixturePath } from '../fixtures/photos/generate';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p, 'latin1')] : p)));

const ftyp = (major: string, ...compatible: string[]) =>
  bytes([0, 0, 0, 16 + compatible.length * 4], 'ftyp', major, [0, 0, 0, 0], ...compatible);

describe('detectFormat', () => {
  test('recognizes the magic numbers of supported formats', () => {
    expect(detectFormat(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectFormat(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectFormat(bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8 '))).toBe('webp');
    for (const brand of ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1']) {
      expect(detectFormat(ftyp(brand, 'mif1', 'heic')), brand).toBe('heic');
    }
    expect(detectFormat(ftyp('heic'))).toBe('heic');
  });

  test('recognizes the fixtures by content', () => {
    const head = (name: string) => readFileSync(fixturePath(name)).subarray(0, 32);
    expect(detectFormat(head('2026-03-14_a.jpg'))).toBe('jpeg');
    expect(detectFormat(head('2026-03-14_c.png'))).toBe('png');
    expect(detectFormat(head('ok.webp'))).toBe('webp');
    expect(detectFormat(head('2026-01-20.heic'))).toBe('heic');
    expect(detectFormat(head('broken.jpg'))).toBe('jpeg');
  });

  test('rejects everything else, whatever the file is called', () => {
    expect(detectFormat(readFileSync(fixturePath('notes.pdf')))).toBeNull();
    expect(detectFormat(bytes('%PDF-1.4'))).toBeNull(); // a PDF named photo.jpg is still a PDF
    expect(detectFormat(bytes('GIF89a'))).toBeNull();
    expect(detectFormat(new Uint8Array())).toBeNull();
    expect(detectFormat(bytes([0xff, 0xd8]))).toBeNull();
    expect(detectFormat(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))).toBeNull();
    expect(detectFormat(ftyp('avif', 'mif1', 'avif'))).toBeNull();
    expect(detectFormat(ftyp('mif1', 'avif', 'miaf'))).toBeNull();
    expect(detectFormat(ftyp('isom', 'mp41'))).toBeNull();
  });
});
