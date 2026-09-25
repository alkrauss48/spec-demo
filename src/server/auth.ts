import 'server-only';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { SqliteDialect } from 'kysely';
import { headers } from 'next/headers';
import { openConnection } from './db';
import { env } from './env';

export class NotAuthenticated extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'NotAuthenticated';
  }
}

function createAuth() {
  const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } = env();
  return betterAuth({
    // Its own connection, never shared with getDb() (see db.ts). Kysely's SQLite driver has no
    // connection lock, so with interactive transactions on, concurrent requests interleave
    // their BEGIN/COMMIT on this one connection and some session lookups never settle. With
    // them off, every statement runs on its own (better-sqlite3 runs each one synchronously).
    database: {
      dialect: new SqliteDialect({ database: openConnection() }),
      type: 'sqlite',
      transaction: false,
    },
    secret: BETTER_AUTH_SECRET,
    baseURL: BETTER_AUTH_URL,
    emailAndPassword: { enabled: true, autoSignIn: true },
    advanced: {
      // httpOnly and SameSite=Lax always; Secure whenever the app is served over HTTPS.
      // Browsers treat http://localhost as secure, but WebKit rejects Secure cookies there,
      // so local and test runs over plain HTTP send the cookie without it.
      useSecureCookies: BETTER_AUTH_URL.startsWith('https:'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    // Better Auth's default limits (e.g. 3 sign-ins per 10 s per IP) stay on in real use. The
    // Playwright servers turn them off because every parallel test signs up from 127.0.0.1.
    rateLimit: { enabled: process.env.E2E_TEST_HOOKS !== '1' },
    telemetry: { enabled: false },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/** Created lazily so importing this module (e.g. during `next build`) needs no env. */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

/** Resolves the session user on the server, or throws NotAuthenticated. */
export async function requireUser(reqHeaders?: Headers): Promise<{ id: string }> {
  const session = await getAuth().api.getSession({ headers: reqHeaders ?? (await headers()) });
  if (!session) throw new NotAuthenticated();
  return { id: session.user.id };
}

/** Maps a Better Auth API error to one of our short error codes for the auth pages. */
export function authErrorCode(err: unknown): 'taken' | 'busy' | 'invalid' | 'failed' {
  const e = err as { status?: string | number; statusCode?: number; body?: { code?: string } };
  if (e?.statusCode === 429 || e?.status === 'TOO_MANY_REQUESTS') return 'busy';
  const code = e?.body?.code ?? '';
  if (code.includes('ALREADY_EXISTS')) return 'taken';
  if (code.includes('INVALID')) return 'invalid';
  return 'failed';
}
