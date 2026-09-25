import type { Page } from '@playwright/test';
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

const HOURS = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];
const ALBUM = [
  ...HOURS.map((h) => ({ captureTime: `2026-03-14T${h}:00:00` })),
  { captureTime: '2026-03-20T12:00:00', dateSource: 'upload' as const },
];
const TIMES = [
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
];

/** Seeds the album and returns photo IDs for Mar 14 in capture order, plus the undated one. */
function seedAlbum(email: string, server: 'main' | 'failing' = 'main') {
  const { photos } = seed(email, { photos: ALBUM }, server);
  const march14 = photos.filter((p) => p.captureTime.startsWith('2026-03-14')).map((p) => p.id);
  const undated = photos.find((p) => p.dateSource === 'upload')!.id;
  return { march14, undated };
}

const thumbs = (page: Page) => page.getByRole('main').getByRole('listitem').getByRole('link');

/** Presses a viewer key once the viewer's key handlers have hydrated. */
async function viewerKey(page: Page, key: string) {
  await page.locator('[data-viewer-keys]').waitFor({ state: 'attached' });
  await page.keyboard.press(key);
}

/** Fires a horizontal touch swipe on the window (works in every engine, no Touch constructor needed). */
async function swipe(page: Page, fromX: number, toX: number) {
  await page.locator('[data-viewer-keys]').waitFor({ state: 'attached' });
  await page.evaluate(
    ([a, b]) => {
      const fire = (type: string, x: number) => {
        const e = new Event(type, { bubbles: true });
        Object.defineProperty(e, 'changedTouches', { value: [{ clientX: x, clientY: 300 }] });
        window.dispatchEvent(e);
      };
      fire('touchstart', a!);
      fire('touchend', b!);
    },
    [fromX, toX],
  );
}

test.describe('US3: open an album and view its photos', () => {
  test('AS1: a tile opens the album, thumbnails oldest first', async ({
    signedInPage: { page, email },
  }) => {
    seedAlbum(email);
    await page.goto('/');
    await page.getByRole('link', { name: 'Mar 14, 2026, 10 photos' }).click();
    await expect(page).toHaveURL(/\/albums\/2026-03-14$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mar 14, 2026');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('10 photos');
    await expect(page).toHaveTitle(/Mar 14, 2026/);
    const images = page.getByRole('main').getByRole('img');
    await expect(images).toHaveCount(10);
    for (const [i, time] of TIMES.entries()) {
      await expect(images.nth(i)).toHaveAttribute('alt', `Photo ${i + 1} of 10, taken ${time}`);
    }
    await expect(page.getByRole('link', { name: '← All photos' })).toHaveAttribute('href', '/');
    await expectNoA11yViolations(page);
  });

  test('AS2: the viewer shows the full image and moves by key, pointer, and swipe', async ({
    signedInPage: { page, email },
  }) => {
    const { march14 } = seedAlbum(email);
    await page.goto('/albums/2026-03-14');
    await thumbs(page).nth(1).click();
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[1]}`);

    const img = page.getByRole('main').getByRole('img');
    await expect(img).toHaveAttribute('alt', 'Photo 2 of 10, taken Mar 14, 2026, 10:00 AM');
    await expect(img).toHaveAttribute('src', `/media/photos/${march14[1]}/full`);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(640);
    await expect(page.getByText('Mar 14, 2026, 10:00 AM', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Photo 2 of 10, Mar 14, 2026');
    await expectNoA11yViolations(page);

    await viewerKey(page, 'ArrowRight');
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[2]}`);
    await viewerKey(page, 'ArrowLeft');
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[1]}`);

    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[2]}`);
    await page.getByRole('link', { name: 'Previous' }).click();
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[1]}`);

    await swipe(page, 400, 200); // left swipe → next
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[2]}`);
    await swipe(page, 200, 400); // right swipe → previous
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[1]}`);
    await swipe(page, 300, 280); // too short: stays put
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[1]}`);

    await page.goto(`/albums/2026-03-14/photos/${march14[0]}`);
    await expect(page.getByRole('link', { name: 'Previous' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Next' })).toBeVisible();
    await page.goto(`/albums/2026-03-14/photos/${march14[9]}`);
    await expect(page.getByRole('link', { name: 'Next' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Previous' })).toBeVisible();
  });

  test('AS3: Esc and Close return to the album with focus on the opened photo (V10)', async ({
    signedInPage: { page, email },
  }) => {
    const { march14 } = seedAlbum(email);
    await page.goto('/albums/2026-03-14');
    await thumbs(page).nth(1).click();
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[1]}`);
    await viewerKey(page, 'Escape');
    await expect(page).toHaveURL(`/albums/2026-03-14#photo-${march14[1]}`);
    await expect(page.locator(`#photo-${march14[1]}`)).toBeFocused();

    await page.goto(`/albums/2026-03-14/photos/${march14[4]}`);
    await page.getByRole('link', { name: 'Close' }).click();
    await expect(page).toHaveURL(`/albums/2026-03-14#photo-${march14[4]}`);
    await expect(page.locator(`#photo-${march14[4]}`)).toBeFocused();
  });

  test('“Date not recorded” shows on fallback-dated photos in the album and viewer (FR-006, V5)', async ({
    signedInPage: { page, email },
  }) => {
    const { undated } = seedAlbum(email);
    await page.goto('/albums/2026-03-20');
    await expect(page.getByText('Date not recorded', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByRole('img')).toHaveAttribute(
      'alt',
      'Photo 1 of 1, date not recorded, added Mar 20, 2026',
    );
    await page.goto(`/albums/2026-03-20/photos/${undated}`);
    await expect(page.getByRole('main').getByRole('img')).toHaveAttribute(
      'alt',
      'Photo 1 of 1, date not recorded, added Mar 20, 2026',
    );
    await expect(page.getByText('Date not recorded, added Mar 20, 2026')).toBeVisible();
  });

  test("V13: another user's album and photo are 404, like missing ones", async ({
    signedInPage: { page, email },
    browser,
  }) => {
    const { march14 } = seedAlbum(email);
    const other = await browser.newContext();
    const pageB = await other.newPage();
    await signUp(pageB);
    for (const path of ['/albums/2026-03-14', `/albums/2026-03-14/photos/${march14[0]}`]) {
      const res = await pageB.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(
        pageB.getByRole('heading', { name: "That page couldn't be found." }),
      ).toBeVisible();
    }
    await expectNoA11yViolations(pageB);
    await other.close();

    expect((await page.goto('/albums/2026-13-01'))?.status()).toBe(404);
    expect((await page.goto('/albums/2026-3-14'))?.status()).toBe(404);
    // A real photo, but not in this album.
    expect((await page.goto(`/albums/2026-03-20/photos/${march14[0]}`))?.status()).toBe(404);
    expect((await page.goto('/albums/2026-03-14/photos/not-a-real-id'))?.status()).toBe(404);
  });

  test('V12: the album at 320 px has no horizontal scroll', async ({
    signedInPage: { page, email },
  }) => {
    seedAlbum(email);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/albums/2026-03-14');
    await expect(thumbs(page)).toHaveCount(10);
    await expectNoHorizontalScroll(page);
    const [a, b] = await Promise.all([
      thumbs(page).nth(0).boundingBox(),
      thumbs(page).nth(1).boundingBox(),
    ]);
    expect(a && b && a.y === b.y).toBe(true);
  });

  test('the viewer shows a placeholder when the full image fails, and navigation still works', async ({
    signedInPage: { page, email },
  }) => {
    const { march14 } = seedAlbum(email);
    await page.route(`**/media/photos/${march14[1]}/full`, (route) => route.abort());
    await page.goto(`/albums/2026-03-14/photos/${march14[1]}`);
    await expect(page.getByText("This photo couldn't be displayed.")).toBeVisible();
    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[2]}`);
  });

  test('loading states: album skeleton and "Loading photo…"', async ({
    signedInPage: { page, email },
  }) => {
    const { march14 } = seedAlbum(email);
    await page.setExtraHTTPHeaders({ 'x-e2e-delay-ms': '2500' });
    await page.goto('/albums/2026-03-14', { waitUntil: 'commit' });
    await expect(page.locator('[aria-busy="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mar 14, 2026', {
      timeout: 10_000,
    });

    await page.goto(`/albums/2026-03-14/photos/${march14[0]}`, { waitUntil: 'commit' });
    await expect(page.getByText('Loading photo…').first()).toBeAttached();
    await expect(page.getByRole('link', { name: 'Close' })).toBeVisible({ timeout: 10_000 });
  });

  test('keyboard only: library → album → viewer → back', async ({
    signedInPage: { page, email },
    browserName,
  }) => {
    const { march14 } = seedAlbum(email);
    await page.goto('/');
    const tile = page.getByRole('link', { name: 'Mar 14, 2026, 10 photos' });
    for (let i = 0; i < 12 && !(await tile.evaluate((el) => el === document.activeElement)); i++) {
      await tab(page, browserName);
    }
    await expect(tile).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/albums\/2026-03-14$/);

    const second = page.locator(`#photo-${march14[1]}`);
    for (
      let i = 0;
      i < 12 && !(await second.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await tab(page, browserName);
    }
    await expect(second).toBeFocused();
    const outline = await second.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[1]}`);
    await viewerKey(page, 'ArrowRight');
    await expect(page).toHaveURL(`/albums/2026-03-14/photos/${march14[2]}`);
    await viewerKey(page, 'Escape');
    await expect(page.locator(`#photo-${march14[2]}`)).toBeFocused();
  });
});

test.describe('US3 error states', () => {
  test.use({ baseURL: FAILING_URL });

  test('V15: album and viewer show ErrorState when the database fails', async ({ page }) => {
    const email = await signUp(page);
    const { march14 } = seedAlbum(email, 'failing');
    for (const path of ['/albums/2026-03-14', `/albums/2026-03-14/photos/${march14[0]}`]) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: "We couldn't load your photos." }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expectNoA11yViolations(page);
    }
  });
});
