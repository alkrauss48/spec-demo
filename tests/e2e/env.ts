// Environment for the two Playwright web servers (T005). Shared by playwright.config.ts and
// the fixtures, so tests can seed the same throwaway database the server reads.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-results');

function serverEnv(name: string, port: number) {
  return {
    DATABASE_PATH: resolve(root, `e2e-${name}`, 'app.db'),
    MEDIA_ROOT: resolve(root, `e2e-${name}`, 'media'),
    BETTER_AUTH_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only',
    BETTER_AUTH_URL: `http://localhost:${port}`,
  };
}

// Test hooks on, failures off: lets the loading-state tests ask for a slow render (T049).
export const MAIN = { port: 3100, env: { ...serverEnv('main', 3100), E2E_TEST_HOOKS: '1' } };
/** Same build, but every photo query fails (T049), for the error-state tests. */
export const FAILING = {
  port: 3101,
  env: { ...serverEnv('failing', 3101), E2E_TEST_HOOKS: '1', E2E_FAIL_DB: '1' },
};
export const FAILING_URL = `http://localhost:${FAILING.port}`;
export const SERVER_LOG = resolve(root, 'server.log');
