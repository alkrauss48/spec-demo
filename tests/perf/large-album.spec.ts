import { expect, seed, test } from '../e2e/fixtures';

// Edge case "Large album" (R12): a 1,000-photo album stays responsive. Interactions are timed
// with the Event Timing API; with this few interactions INP is the slowest one.

test('a 1,000-photo album keeps interactions under 200 ms while scrolling', async ({
  signedInPage: { page, email },
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'Event Timing is Chromium-only');
  test.setTimeout(5 * 60_000);
  seed(email, { count: 1000, albums: 1, start: '2026-03-14' });

  await page.goto('/albums/2026-03-14');
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(1000);
  await page.evaluate(() => {
    const w = window as unknown as { __durations: number[] };
    w.__durations = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEventTiming & {
        interactionId?: number;
      })[]) {
        if (e.interactionId) w.__durations.push(e.duration);
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  });

  const box = page.getByRole('main');
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 1200);
    if (i % 5 === 0) {
      await page.keyboard.press('Tab'); // keyboard interaction mid-scroll
      await box.click({ position: { x: 2, y: 2 } }); // pointer interaction on the page background
    }
  }
  await page.keyboard.press('End');
  await page.waitForTimeout(500);

  const durations = await page.evaluate(
    () => (window as unknown as { __durations: number[] }).__durations,
  );
  const worst = Math.max(0, ...durations);
  testInfo.annotations.push({
    type: 'INP',
    description: `worst interaction ${worst} ms over ${durations.length} slow entries`,
  });
  console.log(`large album: worst interaction ${worst} ms (${durations.length} entries ≥ 16 ms)`);
  expect(worst).toBeLessThanOrEqual(200);
});
