import 'server-only';

export type UploadFormat = 'jpeg' | 'png' | 'webp' | 'heic';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis']);
// Generic HEIF brands, also used by AVIF; accepted only with an HEVC brand alongside.
const HEIF_GENERIC = new Set(['mif1', 'msf1']);

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end));

/** The format from the file's magic bytes. Never looks at the file name or client MIME type (R5). */
export function detectFormat(head: Uint8Array): UploadFormat | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && PNG_SIGNATURE.every((byte, i) => head[i] === byte)) return 'png';
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP')
    return 'webp';
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp') {
    const boxSize = (head[0]! << 24) | (head[1]! << 16) | (head[2]! << 8) | head[3]!;
    const major = ascii(head, 8, 12);
    if (HEIC_BRANDS.has(major)) return 'heic';
    if (HEIF_GENERIC.has(major)) {
      const end = Math.min(boxSize, head.length);
      for (let i = 16; i + 4 <= end; i += 4) {
        if (HEIC_BRANDS.has(ascii(head, i, i + 4))) return 'heic';
      }
    }
  }
  return null;
}
