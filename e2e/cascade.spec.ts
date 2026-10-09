import { expect, test } from 'playwright/test';

// Cascade-layer canary (see .agents/skills/css-cascade/SKILL.md). The layer
// order declared inline in the shell head must keep four invariants that
// used to break one by one when styles were one specificity pool:
// - uno utilities (layer `default`) beat prose defaults: explicit classes
//   like the card grid keep working (regression 80c0ae7: `#ap-content li`
//   margin beat a space-y utility);
// - prose defaults reach the article body: the uno reset (layer `base`)
//   never flattens the typography (the reset used to sit unlayered);
// - chrome rules beat prose: islands inside the column keep real tables
//   and their own padding (ExpandableList re-scoped everything under
//   #ap-content for years);
// - the layer statement is the first style the document sees.

test('shell declares the cascade order before any stylesheet', async ({
  page,
}) => {
  await page.goto('/guide/markdown');
  const text = await page
    .locator('head style')
    .first()
    .evaluate(el => el.textContent);
  expect(text).toMatch(/^@layer [a-z-]+(, [a-z-]+)+;$/);
});

test('article prose typography survives the uno reset', async ({ page }) => {
  await page.goto('/guide/markdown');
  const h1 = page.locator('.ap-main h1').first();
  // 1.9rem at the 16px root; the uno reset (h1 { font-size: inherit }) sits
  // in layer `base`, under ap-prose.
  await expect(h1).toHaveCSS('font-size', '30.4px');
});

test('card grids keep their spacing over prose list rules', async ({
  page,
}) => {
  // ArchiveView mounts the card list client-side (HomeFeed on custom sites).
  await page.goto('/category/指南');
  const cards = page.locator('.ap-cards').first();
  await expect(cards).toBeAttached();
  await expect(cards).toHaveCSS('display', 'grid');
  // 0.75rem gap; prose li margins and the sibling-margin habit cannot eat
  // card spacing (regression 80c0ae7).
  await expect(cards).toHaveCSS('row-gap', '12px');
});

test('expandable-list keeps real table layout over prose table defaults', async ({
  page,
}) => {
  await page.goto('/guide/islands');
  const table = page.locator('.ap-xlist__table').first();
  await expect(table).toHaveCSS('display', 'table');
  const cell = table.locator('td').first();
  // Chrome-layer cell padding, not the prose `:where(th, td)` defaults.
  await expect(cell).toHaveCSS('padding-top', '8px');
  await expect(cell).toHaveCSS('padding-left', '8.8px');
});

test('details container summary sits flush with its panel', async ({
  page,
}) => {
  await page.goto('/guide/markdown');
  const summary = page.locator('.ap-container--details > summary').first();
  // Prose heading margins must not leak into the disclosure row.
  await expect(summary).toHaveCSS('margin-top', '0px');
});
