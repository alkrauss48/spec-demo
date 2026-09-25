import { defineConfig, devices } from '@playwright/test';
import { FAILING, MAIN, SERVER_LOG } from './tests/e2e/env';

const envPrefix = (env: Record<string, string>) =>
  Object.entries(env)
    .map(([k, v]) => `${k}='${v}'`)
    .join(' ');

// Each server starts from an empty database. The first builds once; the second reuses it.
const start = (server: typeof MAIN | typeof FAILING, build: boolean) => {
  const dir = server.env.DATABASE_PATH.replace(/\/app\.db$/, '');
  const env = envPrefix(server.env);
  return [
    `rm -rf '${dir}' && mkdir -p '${dir}'`,
    ...(build ? ['npm run build'] : []),
    `${env} npx tsx --conditions=react-server scripts/migrate.ts`,
    `${env} npx next start -p ${server.port}`,
  ].join(' && ');
};

export default defineConfig({
  testDir: 'tests',
  testMatch: ['e2e/**/*.spec.ts', 'perf/**/*.spec.ts'],
  outputDir: 'test-results/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${MAIN.port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      // Server stdout (JSON log lines) is kept for the log-privacy check (T081).
      command: `mkdir -p test-results && (${start(MAIN, true)}) 2>&1 | tee '${SERVER_LOG}'`,
      url: `http://localhost:${MAIN.port}/sign-in`,
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: 'ignore',
    },
    {
      command: start(FAILING, false),
      url: `http://localhost:${FAILING.port}/sign-in`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
