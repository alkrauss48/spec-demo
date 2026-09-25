import 'server-only';

export interface Env {
  DATABASE_PATH: string;
  MEDIA_ROOT: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  /** Origin of BETTER_AUTH_URL; state-changing requests must come from it. */
  APP_ORIGIN: string;
}

let cached: Env | undefined;

/** Reads and validates the environment once. Error messages name variables, never values. */
export function env(): Env {
  if (cached) return cached;
  const missing: string[] = [];
  const read = (name: string) => {
    const value = process.env[name];
    if (!value) missing.push(name);
    return value ?? '';
  };
  const DATABASE_PATH = read('DATABASE_PATH');
  const MEDIA_ROOT = read('MEDIA_ROOT');
  const BETTER_AUTH_SECRET = read('BETTER_AUTH_SECRET');
  const BETTER_AUTH_URL = read('BETTER_AUTH_URL');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters');
  }
  let APP_ORIGIN: string;
  try {
    APP_ORIGIN = new URL(BETTER_AUTH_URL).origin;
  } catch {
    throw new Error('BETTER_AUTH_URL must be a valid URL');
  }
  cached = { DATABASE_PATH, MEDIA_ROOT, BETTER_AUTH_SECRET, BETTER_AUTH_URL, APP_ORIGIN };
  return cached;
}
