import { FAILING_URL } from './env';
import {
  expect,
  expectNoA11yViolations,
  expectNoHorizontalScroll,
  seed,
  signUp,
  tab,
  test,
} from './fixtures';

const at = (date: string, time: string) => ({ captureTime: `${date}T${time}` });

// Mar 14 (5 photos), Mar 2 (1), Jan 20 (2), Jan 5 (3).
const LIBRARY = [
  at('2026-03-14', '09:00:00'),
  at('2026-03-14', '10:00:00'),
  at('2026-03-14', '11:00:00'),
  at('2026-03-14', '12:00:00'),
  at('2026-03-14', '13:00:00'),
  at('2026-03-02', '12:00:00'),
  at('2026-01-20', '09:00:00'),
  at('2026-01-20', '10:00:00'),
  at('2026-01-05', '09:00:00'),
  at('2026-01-05', '10:00:00'),
  at('2026-01-05', '11:00:00'),
];

test.describe('US1: browse albums as date-grouped tiles', () => {
  test('AS1: month headings newest first, each tile under its month', async ({
    signedInPage: { page, email },
  }) => {
    seed(email, { photos: LIBRARY });
    await page.goto('/');
    const headings = page.getByRole('heading', { level: 2 });
    await expect(headings).toHaveText(['March 2026', 'January 2026']);

    const march = page.getByRole('region', { name: 'March 2026' });
    const january = page.getByRole('region', { name: 'January 2026' });
    await expect(march.getByRole('link')).toHaveText([/Mar 14, 2026/, /Mar 2, 2026/]);
    await expect(january.getByRole('link')).toHaveText([/Jan 20, 2026/, /Jan 5, 2026/]);
  });

  test('AS2: a 5-photo tile shows 4 previews, its date, and its count', async ({
    signedInPage: { page, email },
  }) => {
    seed(email, { photos: LIBRARY });
    await page.goto('/');
    const tile = page.getByRole('link', { name: 'Mar 14, 2026, 5 photos' });
    await expect(tile).toBeVisible();
    await expect(tile.locator('img')).toHaveCount(4);
    await expect(tile).toContainText('Mar 14, 2026');
    await expect(tile).toContainText('5 photos');
  });

  test('AS3: 1-, 2-, and 3-photo tiles have no empty cells or broken images', async ({
    signedInPage: { page, email },
  }) => {
    seed(email, { photos: LIBRARY });
    await page.goto('/');
    for (const [name, count] of [
      ['Mar 2, 2026, 1 photo', 1],
      ['Jan 20, 2026, 2 photos', 2],
      ['Jan 5, 2026, 3 photos', 3],
    ] as const) {
      const tile = page.getByRole('link', { name });
      const images = tile.locator('img');
      await expect(images).toHaveCount(count);
      // Every mosaic cell holds an image; none are empty.
      await expect(tile.locator('[data-cell]')).toHaveCount(count);
      for (const img of await images.all()) {
        await img.scrollIntoViewIfNeeded();
        await expect
          .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
          .toBe(true);
      }
    }
  });

  test('AS4: keyboard reaches every tile in order with a visible focus ring', async ({
    signedInPage: { page, email },
    browserName,
  }) => {
    seed(email, { photos: LIBRARY });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your photos', level: 1 })).toBeVisible();
    await tab(page, browserName);
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();

    const names = [
      'Mar 14, 2026, 5 photos',
      'Mar 2, 2026, 1 photo',
      'Jan 20, 2026, 2 photos',
      'Jan 5, 2026, 3 photos',
    ];
    // Tab past the header controls until the first tile has focus.
    for (let i = 0; i < 10; i++) {
      await tab(page, browserName);
      if (
        await page
          .getByRole('link', { name: names[0] })
          .evaluate((el) => el === document.activeElement)
      )
        break;
    }
    for (const [i, name] of names.entries()) {
      if (i > 0) await tab(page, browserName);
      const tile = page.getByRole('link', { name });
      await expect(tile).toBeFocused();
      const outline = await tile.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).not.toBe('none');
    }
  });

  test('V1: empty library shows the empty state and usage', async ({ signedInPage: { page } }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'No photos yet' })).toBeVisible();
    await expect(page.getByText('0 of 1,000 photos')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('V12: 320 px shows 2 columns and no horizontal scroll', async ({
    signedInPage: { page, email },
  }) => {
    seed(email, { photos: LIBRARY });
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    const tiles = page.getByRole('region', { name: 'January 2026' }).getByRole('listitem');
    const [a, b] = await Promise.all([tiles.nth(0).boundingBox(), tiles.nth(1).boundingBox()]);
    expect(a && b && a.y === b.y && b.x > a.x).toBe(true);
    await expectNoHorizontalScroll(page);
  });

  test('Preview failed: a broken thumbnail becomes a placeholder and the tile still works', async ({
    signedInPage: { page, email },
  }) => {
    const { photos } = seed(email, { photos: [at('2026-03-02', '12:00:00')] });
    await page.route(`**/media/photos/${photos[0]!.id}/thumb`, (route) => route.abort());
    await page.goto('/');
    const tile = page.getByRole('link', { name: 'Mar 2, 2026, 1 photo' });
    await expect(tile.locator('[data-image-failed]')).toHaveCount(1);
    await expect(tile.locator('img')).toHaveCount(0);
    await tile.click();
    await expect(page).toHaveURL(/\/albums\/2026-03-02$/);
  });

  test('Loading: a skeleton with aria-busy shows while the library renders', async ({
    signedInPage: { page, email },
  }) => {
    seed(email, { photos: LIBRARY });
    await page.setExtraHTTPHeaders({ 'x-e2e-delay-ms': '2500' });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your photos', level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  });

  test('Limit reached: the usage line is highlighted at 1,000 photos', async ({
    signedInPage: { page, email },
  }) => {
    test.slow();
    seed(email, { count: 1000, albums: 100 });
    await page.goto('/');
    const usage = page.getByText('1,000 of 1,000 photos');
    await expect(usage).toBeVisible();
    await expect(usage).toHaveAttribute('data-limit-reached', 'true');
  });

  test('populated library passes axe', async ({ signedInPage: { page, email } }) => {
    seed(email, { photos: LIBRARY });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('US1 error state', () => {
  test.use({ baseURL: FAILING_URL });

  test('V15: a database failure shows ErrorState with Try again', async ({ page }) => {
    await signUp(page);
    await expect(
      page.getByRole('heading', { name: "We couldn't load your photos." }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByText(/^Reference: /)).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(
      page.getByRole('heading', { name: "We couldn't load your photos." }),
    ).toBeVisible();
  });
});
