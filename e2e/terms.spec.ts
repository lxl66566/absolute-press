import { expect, test } from 'playwright/test';

// Term popovers (runtime/terms.ts, theme.css): hover opens a popover layer
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
  // 21 CJK glyphs at 15px + padding: far below the 50rem cap.
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
  expect(box.width).toBeLessThanOrEqual(Math.min(640, viewport.width - 16) + 1);
  expect(box.height).toBeLessThanOrEqual(viewport.height / 2 + 1);
});

// A term inside an open layer opens a deeper layer next to itself: the
// parent must stay open (its body holds the hovered term — reusing it
// would detach the term and strand the new layer at the document origin).
test('nested term opens a second layer near it and keeps the parent', async ({
  page,
}) => {
  await page.goto('/guide/markdown');
  await page.locator('.ap-term[data-term="island"]').first().hover();
  const parent = page.locator('#ap-content .ap-term-popover');
  await expect(parent).toBeVisible();

  const nested = parent.locator('.ap-term[data-term="ssg"]');
  await nested.hover();
  const layers = page.locator('#ap-content .ap-term-popover');
  await expect(layers).toHaveCount(2);

  const termBox = (await nested.boundingBox())!;
  const childBox = (await layers.nth(1).boundingBox())!;
  // Anchored at the term (6px gap), placed below or flipped above it.
  const below = Math.abs(childBox.y - (termBox.y + termBox.height) - 6);
  const above = Math.abs(childBox.y + childBox.height - termBox.y + 6);
  expect(Math.min(below, above)).toBeLessThan(24);

  // Moving slowly toward the child keeps both layers open: the hide grace
  // timer re-arms on pointer motion.
  const target = { x: childBox.x + 8, y: childBox.y + 8 };
  await page.mouse.move(target.x, target.y, { steps: 40 });
  await expect(layers).toHaveCount(2);

  // Resting outside the chain closes both after the grace period.
  await page.mouse.move(8, 8);
  await page.waitForTimeout(400);
  await expect(layers).toHaveCount(0);
});
