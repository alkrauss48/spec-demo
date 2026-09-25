import { randomUUID } from 'node:crypto';
import { NotAuthenticated, requireUser } from '@/server/auth';
import { env } from '@/server/env';
import { log, withRequestContext } from '@/server/log';
import {
  IngestError,
  ingestPhoto,
  sanitizeFilename,
  type IngestErrorCode,
} from '@/server/photos/ingest';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
// Room for the multipart boundaries, part headers, and the timezone field.
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
const REQUEST_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

type Code =
  | IngestErrorCode
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ORIGIN'
  | 'BAD_REQUEST'
  | 'FILE_TOO_LARGE'
  | 'INTERNAL';

const STATUS: Record<Code, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN_ORIGIN: 403,
  BAD_REQUEST: 400,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_TYPE: 415,
  UNREADABLE_IMAGE: 422,
  DUPLICATE: 409,
  LIBRARY_LIMIT_REACHED: 409,
  INTERNAL: 500,
};

/** User-facing messages from contracts/api.openapi.yaml, naming the file when known (FR-008). */
function message(code: Code, name: string | null): string {
  const file = name ?? 'This photo';
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Please sign in again.';
    case 'FORBIDDEN_ORIGIN':
      return 'This request was blocked.';
    case 'BAD_REQUEST':
      return 'Send exactly one photo per request.';
    case 'FILE_TOO_LARGE':
      return `${file} is larger than the 50 MB limit.`;
    case 'UNSUPPORTED_TYPE':
      return `${file} isn't a supported photo. Use JPEG, PNG, HEIC, or WebP.`;
    case 'UNREADABLE_IMAGE':
      return `${file} couldn't be read as a photo.`;
    case 'DUPLICATE':
      return `${file} is already in your library, so it was skipped.`;
    case 'LIBRARY_LIMIT_REACHED':
      return `${file} wasn't added because your library has reached its limit of 1,000 photos.`;
    case 'INTERNAL':
      return 'Something went wrong adding this photo. Please try again.';
  }
}

class TooLarge extends Error {}

/** Counts bytes as they stream in and errors once the limit is passed (FR-009). */
function limitStream(body: ReadableStream<Uint8Array>, limit: number) {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > limit) controller.error(new TooLarge());
        else controller.enqueue(chunk);
      },
    }),
  );
}

export async function POST(request: Request) {
  const start = performance.now();
  // This route is excluded from middleware (which would buffer and truncate large bodies),
  // so it assigns its own request ID.
  const supplied = request.headers.get('x-request-id');
  const requestId = supplied && REQUEST_ID_RE.test(supplied) ? supplied : randomUUID();

  return withRequestContext(requestId, async () => {
    let fileName: string | null = null;
    const fail = (code: Code) => {
      if (code === 'DUPLICATE') log.info('photo.upload.duplicate');
      else log.warn('photo.upload.rejected', { reason: code });
      return Response.json(
        {
          code,
          message: message(code, fileName),
          fileName,
          ...(code === 'INTERNAL' ? { requestId } : {}),
        },
        { status: STATUS[code], headers: { 'x-request-id': requestId } },
      );
    };

    try {
      let user: { id: string };
      try {
        user = await requireUser(request.headers);
      } catch (err) {
        if (err instanceof NotAuthenticated) return fail('UNAUTHENTICATED');
        throw err;
      }

      if (request.headers.get('origin') !== env().APP_ORIGIN) return fail('FORBIDDEN_ORIGIN');

      const declared = Number(request.headers.get('content-length') ?? NaN);
      if (declared > MAX_BODY_BYTES) return fail('FILE_TOO_LARGE');
      const contentType = request.headers.get('content-type') ?? '';
      if (!request.body || !contentType.startsWith('multipart/form-data'))
        return fail('BAD_REQUEST');

      let form: FormData;
      try {
        form = await new Response(limitStream(request.body, MAX_BODY_BYTES), {
          headers: { 'content-type': contentType },
        }).formData();
      } catch (err) {
        if (err instanceof TooLarge || (err as { cause?: unknown }).cause instanceof TooLarge) {
          return fail('FILE_TOO_LARGE');
        }
        return fail('BAD_REQUEST');
      }

      const files = form.getAll('file').filter((f): f is File => typeof f !== 'string');
      if (files.length !== 1 || form.getAll('file').length !== 1) return fail('BAD_REQUEST');
      const file = files[0]!;
      fileName = sanitizeFilename(file.name);
      if (file.size > MAX_FILE_BYTES) return fail('FILE_TOO_LARGE');

      const timezone = form.get('timezone');
      const result = await ingestPhoto({
        userId: user.id,
        bytes: new Uint8Array(await file.arrayBuffer()),
        originalFilename: file.name,
        timezone: typeof timezone === 'string' ? timezone : null,
      });
      log.info('photo.upload.accepted', {
        userId: user.id,
        photoId: result.photo.id,
        format: result.format,
        bytes: file.size,
        date_source: result.photo.dateSource,
        duration_ms: Math.round(performance.now() - start),
      });
      return Response.json(
        { photo: result.photo, album: result.album, usage: result.usage },
        { status: 201, headers: { 'x-request-id': requestId } },
      );
    } catch (err) {
      if (err instanceof IngestError) return fail(err.code);
      log.error('photo.upload.failed', {
        message: err instanceof Error ? err.message : 'unknown',
        stack: err instanceof Error ? err.stack : undefined,
      });
      return fail('INTERNAL');
    }
  });
}
