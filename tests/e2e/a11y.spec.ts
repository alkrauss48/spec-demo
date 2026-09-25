import { FAILING_URL } from './env';
import { expect, expectNoA11yViolations, seed, signUp, test } from './fixtures';

// Every route and state in ui-routes.md, in both Chromium and WebKit (SC-006, Principle III).

test.describe('accessibility sweep', () => {
  test('sign-in and sign-up, including field errors', async ({ page }) => {
    for (const path of [
      '/sign-in',
      '/sign-up',
      '/sign-in?error=invalid',
      '/sign-up?error=password',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page);
    }
    // Errors are tied to their field.
    await page.goto('/sign-in?error=invalid');
    await expect(page.getByLabel('Password')).toHaveAccessibleDescription(/don’t match an account/);
  });

  test('library (empty and populated), album, photo, and 404', async ({
    signedInPage: { page, email },
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible();
    await expectNoA11yViolations(page);

    const { photos } = seed(email, {
      photos: [
        { captureTime: '2026-03-14T09:00:00' },
        { captureTime: '2026-03-14T10:00:00' },
        { captureTime: '2026-03-20T12:00:00', dateSource: 'upload' },
      ],
    });
    for (const path of [
      '/',
      '/albums/2026-03-14',
      '/albums/2026-03-20',
      `/albums/2026-03-14/photos/${photos[0]!.id}`,
      `/albums/2026-03-20/photos/${photos[2]!.id}`,
      '/albums/2026-01-01',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeAttached();
      await expectNoA11yViolations(page);
    }
  });
});

test.describe('accessibility sweep: error state', () => {
  test.use({ baseURL: FAILING_URL });

  test('library error state', async ({ page }) => {
    await signUp(page);
    await expect(
      page.getByRole('heading', { name: "We couldn't load your photos." }),
    ).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
