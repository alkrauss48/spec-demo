import 'server-only';
import sharp from 'sharp';

/** Pixel cap (about 16384 × 16384) guarding against decompression bombs (R5). */
export const MAX_INPUT_PIXELS = 268_402_689;

/** A 400×400 center-cropped WebP preview, upright, with no metadata written (R9). */
export function makeThumb(fullBytes: Uint8Array): Promise<Buffer> {
  return sharp(fullBytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(400, 400, { fit: 'cover', position: 'centre' })
    .webp({ quality: 75 })
    .toBuffer();
}
