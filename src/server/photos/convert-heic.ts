import 'server-only';
import heicDecode from 'heic-decode';
import sharp from 'sharp';
import { MAX_INPUT_PIXELS } from './preview';
import { UnreadableImage } from './strip-metadata';

/**
 * Decodes the primary HEIC image and encodes a full-resolution JPEG (q95, 4:4:4) with no
 * metadata. libheif applies the container's irot/imir transforms while decoding, so the
 * result is upright and carries no Orientation tag (FR-008, FR-015, R6).
 */
export async function convertHeic(
  bytes: Uint8Array,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  let images: Awaited<ReturnType<typeof heicDecode.all>>;
  try {
    images = await heicDecode.all({ buffer: bytes });
  } catch {
    throw new UnreadableImage('HEIC container');
  }
  try {
    const primary = images[0];
    if (!primary) throw new UnreadableImage('no HEIC image');
    if (primary.width * primary.height > MAX_INPUT_PIXELS)
      throw new UnreadableImage('too many pixels');
    let decoded;
    try {
      decoded = await primary.decode();
    } catch {
      throw new UnreadableImage('HEIC decode');
    }
    const { width, height, data } = decoded;
    const jpeg = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    })
      .removeAlpha()
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
    return { bytes: jpeg, width, height };
  } finally {
    images.dispose();
  }
}
