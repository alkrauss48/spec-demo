import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';
import { fixturePath } from '../fixtures/photos/generate';
import { FAILING, MAIN } from './env';

export { expect };

export type SignedIn = { page: Page; email: string };
type SeedPhoto = { captureTime: string; dateSource?: 'exif' | 'upload' };
type Seeded = { userId: string; photos: { id: string; captureTime: string; dateSource: string }[] };

let counter = 0;

/**
 * Signs a new, unique user up through the real /sign-up form. Retries when the form reports
 * a failure: seeding runs in a separate process, and its writes can make a sign-up
 * transaction that started just before them fail with SQLITE_BUSY_SNAPSHOT. A single
 * server process (production) never sees this.
 */
export async function signUp(page: Page): Promise<string> {
  const email = `e2e-${process.pid}-${Date.now()}-${++counter}@example.test`;
  for (let attempt = 1; ; attempt++) {
    await page.goto('/sign-up');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('password1234');
    await page.getByRole('button', { name: 'Create account' }).click();
    const library = page.getByRole('heading', { name: 'Your photos', level: 1 });
    const failed = page.locator('.field-error');
    const loadError = page.getByRole('heading', { name: "We couldn't load your photos." });
    await expect(library.or(failed).or(loadError)).toBeVisible({ timeout: 15_000 });
    if (!(await failed.isVisible())) return email;
    if (attempt === 3) throw new Error(`Sign-up failed: ${page.url()}`);
  }
}

/** WebKit on macOS only Tabs to links with Option held (Safari's default setting); elsewhere Tab does. */
export async function tab(page: Page, browserName: string) {
  const optionTab = browserName === 'webkit' && process.platform === 'darwin';
  await page.keyboard.press(optionTab ? 'Alt+Tab' : 'Tab');
}

/**
 * Seeds photos into the database a test server reads, through scripts/seed.ts (T042).
 * It runs as a child process with the `react-server` condition so `server-only` resolves.
 */
export function seed(
  email: string,
  opts: { count: number; albums?: number; start?: string } | { photos: SeedPhoto[] },
  server: 'main' | 'failing' = 'main',
): Seeded {
  const env = server === 'main' ? MAIN.env : FAILING.env;
  const args = ['tsx', '--conditions=react-server', 'scripts/seed.ts', '--user', email, '--json'];
  if ('photos' in opts) args.push('--photos-json', JSON.stringify(opts.photos));
  else {
    args.push('--photos', String(opts.count));
    if (opts.albums) args.push('--albums', String(opts.albums));
    if (opts.start) args.push('--start', opts.start);
  }
  const out = execFileSync('npx', args, {
    env: { ...process.env, ...env, E2E_TEST_HOOKS: '', E2E_FAIL_DB: '' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = out.trim().split('\n').pop() ?? '{}';
  return JSON.parse(line) as Seeded;
}

/** Fails on any serious or critical axe violation (SC-006). */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    blocking.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
    ),
  ).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Sets fixture files on the (hidden) Add photos input, once the page has hydrated. */
export async function uploadFixtures(page: Page, names: string[]) {
  await page.locator('[data-upload-ready]').waitFor({ state: 'attached' });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(names.map((n) => fixturePath(n)));
}

export const test = base.extend<{ signedInPage: SignedIn }>({
  signedInPage: async ({ page }, provide) => {
    const email = await signUp(page);
    await provide({ page, email });
  },
});
