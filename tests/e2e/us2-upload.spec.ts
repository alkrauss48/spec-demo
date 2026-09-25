import { ensureTooBig } from '../fixtures/photos/generate';
import { albumLabel } from '../../src/lib/dates';
import { expect, expectNoA11yViolations, seed, tab, test, uploadFixtures } from './fixtures';
import type { Page } from '@playwright/test';

/** Today's date in the browser's own time zone, as the server should compute it. */
const browserToday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

async function waitForSummary(page: Page) {
  const summary = page.getByTestId('upload-summary');
  await expect(summary).toBeVisible({ timeout: 30_000 });
  return summary;
}

test.describe('US2: add photos and have them placed into albums by date', () => {
  test('V2: photos from three days make three albums under the right months (AS1, SC-003)', async ({
    signedInPage: { page },
  }) => {
    await page.goto('/');
    await uploadFixtures(page, [
      '2026-03-14_a.jpg',
      '2026-03-14_b.jpg',
      '2026-03-02.jpg',
      '2026-01-20.heic',
    ]);
    await expect(await waitForSummary(page)).toContainText(
      'Added 4 · Skipped as duplicate 0 · Rejected 0',
    );
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'March 2026',
      'January 2026',
    ]);
    const march = page.getByRole('region', { name: 'March 2026' }).getByRole('link');
    await expect(march).toHaveCount(2);
    await expect(march.nth(0)).toHaveAccessibleName('Mar 14, 2026, 2 photos');
    await expect(march.nth(1)).toHaveAccessibleName('Mar 2, 2026, 1 photo');
    const january = page.getByRole('region', { name: 'January 2026' }).getByRole('link');
    await expect(january).toHaveCount(1);
    await expect(january.nth(0)).toHaveAccessibleName('Jan 20, 2026, 1 photo');
  });

  test('V3: a photo from an existing day joins its album (AS2)', async ({
    signedInPage: { page },
  }) => {
    await page.goto('/');
    await uploadFixtures(page, ['2026-03-14_a.jpg', '2026-03-14_b.jpg']);
    await waitForSummary(page);
    await expect(page.getByRole('link', { name: 'Mar 14, 2026, 2 photos' })).toBeVisible();
    await uploadFixtures(page, ['2026-03-14_c.png']);
    await expect(page.getByRole('link', { name: 'Mar 14, 2026, 3 photos' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('region', { name: 'March 2026' }).getByRole('listitem'),
    ).toHaveCount(1);
  });

  test('V5: undated and future-dated photos land in today’s album (AS3)', async ({
    signedInPage: { page },
  }) => {
    await page.goto('/');
    await uploadFixtures(page, ['no-date.jpg', 'future-date.jpg']);
    await expect(await waitForSummary(page)).toContainText('Added 2');
    const today = await browserToday(page);
    await expect(page.getByRole('link', { name: `${albumLabel(today)}, 2 photos` })).toBeVisible();
  });

  test.describe('in Tokyo', () => {
    test.use({ timezoneId: 'Asia/Tokyo' });

    test('V6: an 11:30 PM photo stays on its own day', async ({ signedInPage: { page } }) => {
      await page.goto('/');
      await uploadFixtures(page, ['2026-03-14_2330.jpg']);
      await waitForSummary(page);
      await expect(page.getByRole('link', { name: 'Mar 14, 2026, 1 photo' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Mar 15, 2026/ })).toHaveCount(0);
    });
  });

  test('V7: progress, then a summary naming each rejected file (AS4, AS5)', async ({
    signedInPage: { page },
  }) => {
    await ensureTooBig();
    await page.goto('/');
    await uploadFixtures(page, ['notes.pdf', 'too-big-51mb.jpg', 'ok.webp']);
    await expect(page.locator('progress')).toBeVisible();
    const summary = await waitForSummary(page);
    await expect(summary).toContainText('Added 1 · Skipped as duplicate 0 · Rejected 2');
    const problems = page.getByTestId('upload-problems');
    await expect(problems).toContainText(
      "notes.pdf isn't a supported photo. Use JPEG, PNG, HEIC, or WebP.",
    );
    await expect(problems).toContainText('too-big-51mb.jpg is larger than the 50 MB limit.');
    await expect(page.getByRole('link', { name: 'Feb 10, 2026, 1 photo' })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('V8: a duplicate is skipped and named (FR-010)', async ({ signedInPage: { page } }) => {
    await page.goto('/');
    await uploadFixtures(page, ['2026-03-14_a.jpg']);
    await waitForSummary(page);
    await uploadFixtures(page, ['2026-03-14_a.jpg']);
    await expect(page.getByTestId('upload-summary')).toContainText(
      'Added 0 · Skipped as duplicate 1 · Rejected 0',
      {
        timeout: 30_000,
      },
    );
    await expect(page.getByTestId('upload-problems')).toContainText(
      'Skipped as duplicate: 2026-03-14_a.jpg',
    );
    await expect(page.getByRole('link', { name: 'Mar 14, 2026, 1 photo' })).toBeVisible();
    await expect(page.getByText('1 of 1,000 photos')).toBeVisible();
  });

  test('V14: at 998 photos, 2 of 5 are added and 3 are rejected at the limit (FR-011)', async ({
    signedInPage: { page, email },
  }) => {
    test.slow();
    seed(email, { count: 998, albums: 50 });
    await page.goto('/');
    await uploadFixtures(page, [
      '2026-03-14_a.jpg',
      '2026-03-14_b.jpg',
      '2026-03-02.jpg',
      '2026-03-14_2330.jpg',
      'no-date.jpg',
    ]);
    const summary = await waitForSummary(page);
    await expect(summary).toContainText('Added 2 · Skipped as duplicate 0 · Rejected 3');
    await expect(
      page.getByTestId('upload-problems').getByText(/limit of 1,000 photos/),
    ).toHaveCount(3);
    await expect(page.getByText('1,000 of 1,000 photos')).toBeVisible({ timeout: 20_000 });
  });

  test('the empty state’s Add photos button opens the picker', async ({
    signedInPage: { page },
  }) => {
    await page.goto('/');
    const empty = page.getByRole('region', { name: 'No photos yet' });
    const chooser = page.waitForEvent('filechooser');
    await empty.getByRole('button', { name: 'Add photos' }).click();
    const picker = await chooser;
    expect(picker.isMultiple()).toBe(true);
  });

  test('keyboard: skip link → Sign out → Add photos → first tile; Enter uploads', async ({
    signedInPage: { page, email },
    browserName,
  }) => {
    seed(email, { photos: [{ captureTime: '2026-03-02T12:00:00' }] });
    await page.goto('/');
    await tab(page, browserName);
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await tab(page, browserName);
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeFocused();
    await tab(page, browserName);
    await expect(page.getByRole('button', { name: 'Add photos' })).toBeFocused();
    await tab(page, browserName);
    await expect(page.getByRole('link', { name: 'Mar 2, 2026, 1 photo' })).toBeFocused();

    await page.getByRole('button', { name: 'Add photos' }).focus();
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (
      await chooser
    ).setFiles([(await import('../fixtures/photos/generate')).fixturePath('2026-03-14_a.jpg')]);
    await expect(await waitForSummary(page)).toContainText('Added 1');
  });

  test('the live region announces progress and the summary', async ({ signedInPage: { page } }) => {
    await page.goto('/');
    const live = page.locator('[aria-live="polite"]');
    await expect(live).toHaveCount(1);
    await uploadFixtures(page, ['2026-03-14_a.jpg', 'notes.pdf']);
    await expect(live).toContainText('Added 1 · Skipped as duplicate 0 · Rejected 1', {
      timeout: 30_000,
    });
    await expectNoA11yViolations(page);
  });
});
