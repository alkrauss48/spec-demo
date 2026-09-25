import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

// Only these field names are ever written, so file names, EXIF values, capture dates,
// emails, and tokens can't end up in a log line by accident (FR-015, R16).
const ALLOWED = new Set([
  'userId',
  'photoId',
  'bytes',
  'format',
  'date_source',
  'duration_ms',
  'total_ms',
  'reason',
  'variant',
  'status',
  'album_count',
  'route',
  'message',
  'stack',
]);

const context = new AsyncLocalStorage<{ requestId: string }>();

export function withRequestContext<T>(requestId: string | null | undefined, fn: () => T): T {
  return context.run({ requestId: requestId || 'none' }, fn);
}

/** The request ID set by middleware on the forwarded request headers. */
export function requestIdFrom(headers: Headers): string {
  return headers.get('x-request-id') ?? 'none';
}

export function currentRequestId(): string {
  return context.getStore()?.requestId ?? 'none';
}

function write(level: Level, event: string, fields: Fields = {}) {
  const line: Fields = {
    level,
    ts: new Date().toISOString(),
    requestId: currentRequestId(),
    event,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (ALLOWED.has(key) && value !== undefined) line[key] = value;
  }
  process.stdout.write(JSON.stringify(line) + '\n');
}

export const log = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};
