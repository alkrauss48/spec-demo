import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NotAuthenticated, requireUser } from '@/server/auth';
import { log, requestIdFrom, withRequestContext } from '@/server/log';
import { fullPath, thumbPath } from '@/server/media-store';
import { PHOTO_ID_RE } from '@/server/photos/ids';
import { getOwnedPhoto } from '@/server/photos/queries';

const CONTENT_TYPE = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ photoId: string; variant: string }> },
) {
  const start = performance.now();
  const requestId = requestIdFrom(request.headers);
  return withRequestContext(requestId, async () => {
    const { photoId, variant: rawVariant } = await params;
    // Only known values reach the log; the path segment itself is user input.
    const variant = rawVariant === 'thumb' || rawVariant === 'full' ? rawVariant : 'invalid';
    const fail = (status: 401 | 404) => {
      log.info('media.served', {
        variant,
        status,
        duration_ms: Math.round(performance.now() - start),
      });
      const body =
        status === 401
          ? { code: 'UNAUTHENTICATED', message: 'Please sign in again.' }
          : { code: 'NOT_FOUND', message: "That photo couldn't be found." };
      return Response.json(body, { status, headers: { 'x-request-id': requestId } });
    };

    let user: { id: string };
    try {
      user = await requireUser(request.headers);
    } catch (err) {
      if (err instanceof NotAuthenticated) return fail(401);
      throw err;
    }

    // Missing, malformed, and other users' photos all look the same (FR-014).
    if (!PHOTO_ID_RE.test(photoId) || variant === 'invalid') return fail(404);
    const photo = getOwnedPhoto(user.id, photoId);
    if (!photo) return fail(404);

    const path =
      variant === 'thumb'
        ? thumbPath(user.id, photo.id)
        : fullPath(user.id, photo.id, photo.stored_format);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return fail(404);
    }

    const completed = (status: number) =>
      log.info('media.completed', {
        variant,
        status,
        total_ms: Math.round(performance.now() - start),
      });
    const stream = createReadStream(path);
    stream.once('end', () => completed(200));
    stream.once('error', () => completed(500));
    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;
    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': variant === 'thumb' ? 'image/webp' : CONTENT_TYPE[photo.stored_format],
        'Content-Length': String(size),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'x-request-id': requestId,
      },
    });
    log.info('media.served', {
      variant,
      status: 200,
      duration_ms: Math.round(performance.now() - start),
    });
    return response;
  });
}
