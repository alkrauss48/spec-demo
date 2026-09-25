import { NotAuthenticated, requireUser } from '@/server/auth';
import { log, requestIdFrom, withRequestContext } from '@/server/log';

const LIMITS = { message: 500, route: 200, stack: 4000, requestId: 64 } as const;
const REQUIRED = ['message', 'route'] as const;
const PER_MINUTE = 20;

// Per-session report counts for the current minute. Single-process, so in-memory is enough.
const counts = new Map<string, { windowStart: number; count: number }>();

function json(status: number, body: unknown, requestId: string) {
  return Response.json(body, { status, headers: { 'x-request-id': requestId } });
}

/** Removes query strings from anything that looks like a URL. */
function stripQueries(text: string): string {
  return text.replace(/(\b(?:https?|webpack|file):\/\/[^\s?#)]*|\/[^\s?#)]*)[?#][^\s)]*/g, '$1');
}

type Report = { message: string; route: string; stack?: string; requestId?: string };

function validate(body: unknown): Report | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (!(key in LIMITS)) return null;
    if (typeof value !== 'string' || value.length > LIMITS[key as keyof typeof LIMITS]) return null;
  }
  if (REQUIRED.some((key) => typeof record[key] !== 'string')) return null;
  return record as Report;
}

function allow(sessionKey: string, now = Date.now()): boolean {
  const entry = counts.get(sessionKey);
  if (!entry || now - entry.windowStart >= 60_000) {
    counts.set(sessionKey, { windowStart: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= PER_MINUTE;
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers);
  return withRequestContext(requestId, async () => {
    let user: { id: string };
    try {
      user = await requireUser(request.headers);
    } catch (err) {
      if (err instanceof NotAuthenticated) {
        return json(401, { code: 'UNAUTHENTICATED', message: 'Please sign in again.' }, requestId);
      }
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      parsed = null;
    }
    const report = validate(parsed);
    if (!report) {
      return json(
        400,
        { code: 'BAD_REQUEST', message: 'The error report was not valid.' },
        requestId,
      );
    }

    if (allow(user.id)) {
      log.warn('client.error', {
        userId: user.id,
        route: report.route,
        message: stripQueries(report.message),
        stack: report.stack ? stripQueries(report.stack) : undefined,
      });
    }
    return new Response(null, { status: 204, headers: { 'x-request-id': requestId } });
  });
}
