import { expect, test } from 'playwright/test';

// Term popovers (runtime/terms.ts, theme.css): hover opens the popover
// hosted inside #ap-content. The size follows the content (one-line refs
// stay small, longer bodies grow to the width cap), and the first child's
// prose margin must not leak a blank strip above the body — site styles
// scope headings under #ap-content with an ID, which a plain class
// selector loses (regression: .ap-term-popover > :first-child alone).

test('one-line term opens a small popover without a top blank', async ({
  page,
}) => {
  await page.goto('/guide/markdown');
  await page.locator('.ap-term[data-term="minimal"]').hover();
  const popover = page.locator('#ap-content .ap-term-popover');
  await expect(popover).toBeVisible();

  const marginTop = await popover.evaluate(
    el => getComputedStyle(el.firstElementChild!).marginTop,
  );
  expect(marginTop).toBe('0px');

  const box = (await popover.boundingBox())!;
  // 21 CJK glyphs at 15px + padding: far below the 26rem cap.
  expect(box.width).toBeGreaterThan(120);
  expect(box.width).toBeLessThan(400);
  expect(box.height).toBeLessThan(120);

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
});

test('long term bodies grow to the caps, never past them', async ({ page }) => {
  await page.goto('/guide/markdown');
  await page.locator('.ap-term[data-term="island"]').hover();
  const popover = page.locator('#ap-content .ap-term-popover');
  await expect(popover).toBeVisible();

  const box = (await popover.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeLessThanOrEqual(Math.min(416, viewport.width - 16) + 1);
  expect(box.height).toBeLessThanOrEqual(viewport.height / 2 + 1);
});
