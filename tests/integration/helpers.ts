import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getMigrations } from 'better-auth/db/migration';
import { getAuth } from '@/server/auth';
import { getDb, runMigrations } from '@/server/db';

export const APP_ORIGIN = 'http://localhost:3000';

/** Runs Better Auth's and our migrations against this test file's temp database. */
export async function freshDb() {
  const { runMigrations: runAuthMigrations } = await getMigrations(getAuth().options);
  await runAuthMigrations();
  runMigrations();
  return getDb();
}

export type TestUser = { id: string; email: string; cookie: string };

let counter = 0;

/** Signs up a user through Better Auth and captures their session cookie. */
export async function createUser(
  email = `user${++counter}-${Date.now()}@example.test`,
): Promise<TestUser> {
  const { headers, response } = await getAuth().api.signUpEmail({
    body: { email, password: 'password1234', name: 'Test' },
    returnHeaders: true,
  });
  return { id: response.user.id, email, cookie: sessionCookieFor(headers) };
}

/** The `name=value` session cookie from a Better Auth response's Set-Cookie headers. */
export function sessionCookieFor(headers: Headers): string {
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .find((c) => c.includes('session_token='));
  if (!cookie) throw new Error('No session cookie in response');
  return cookie;
}

export type UploadFile = { name: string; bytes: Uint8Array; type?: string };

export function fixtureFile(path: string, name = basename(path)): UploadFile {
  return { name, bytes: readFileSync(path) };
}

/** A multipart `POST /api/photos` request for calling the route handler directly. */
export function uploadRequest(
  file: UploadFile | null,
  opts: {
    cookie?: string;
    origin?: string | null;
    timezone?: string;
    extraFiles?: UploadFile[];
  } = {},
): Request {
  const form = new FormData();
  for (const f of [...(file ? [file] : []), ...(opts.extraFiles ?? [])]) {
    form.append(
      'file',
      new File([f.bytes as BlobPart], f.name, { type: f.type ?? 'application/octet-stream' }),
    );
  }
  if (opts.timezone) form.append('timezone', opts.timezone);
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.origin !== null) headers.set('origin', opts.origin ?? APP_ORIGIN);
  headers.set('x-request-id', `test-${++counter}`);
  return new Request(`${APP_ORIGIN}/api/photos`, { method: 'POST', headers, body: form });
}

/** A GET/POST request with a session cookie, for the other route handlers. */
export function authedRequest(
  path: string,
  opts: { cookie?: string; method?: string; body?: unknown } = {},
): Request {
  const headers = new Headers({ origin: APP_ORIGIN });
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`${APP_ORIGIN}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
