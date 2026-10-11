import { expect, test } from 'playwright/test';

/**
 * The docs-site DemoXList island (guide/islands): the only XList with
 * toolbar filters on the page, exercising the data-driven toolkit end to
 * end — a text column, numeric sortValue columns, the per-column sortable
 * whitelist, the exclusion filter, search, inline folds and expandable slot
 * bodies.
 */

const PAGE = '/guide/islands';
// Scoped by the toolbar filter chip (unique to DemoXList) instead of demo
// ordinal, so adding demos elsewhere on the page cannot retarget these.
const LIST = '.ap-xlist:has(.ap-xlist__filter)';

test('DemoXList renders the data-driven table with a sortable whitelist', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST);
  await expect(list.locator('.ap-xlist__row')).toHaveCount(7);
  await expect(list.locator('.ap-xlist__count')).toHaveText('7 / 7 条');
  // Whitelist ['title', 0, 1]: three sorters; the 状态 header has none.
  await expect(list.locator('.ap-xlist__sorter')).toHaveCount(3);
  await expect(
    list.locator('.ap-xlist__th').nth(3).locator('button'),
  ).toHaveCount(0);
});

test('Stars column sorts numerically, descending first', async ({ page }) => {
  await page.goto(PAGE);
  const list = page.locator(LIST);
  await list.locator('.ap-xlist__sorter').nth(2).click();
  // Toggle buttons carry the bare titles (inline notes live outside them).
  await expect(
    list.locator('.ap-xlist__toggle').allTextContents(),
  ).resolves.toEqual(['fzf', 'ripgrep', 'bat', 'fd', 'jq', 'eza', 'xsv']);
});

test('the exclusion filter hides flagged rows and the count follows', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST);
  await list.locator('.ap-xlist__filter input').check();
  await expect(list.locator('.ap-xlist__row')).toHaveCount(5);
  await expect(list.locator('.ap-xlist__count')).toHaveText('5 / 7 条');
  await list.locator('.ap-xlist__filter input').uncheck();
  await expect(list.locator('.ap-xlist__count')).toHaveText('7 / 7 条');
});

test('search hits titles and rows expand their slot bodies', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST);
  await list.locator('.ap-xlist__search').fill('fzf');
  await expect(list.locator('.ap-xlist__row')).toHaveCount(1);
  await list.locator('.ap-xlist__search').fill('');
  await list.locator('.ap-xlist__toggle').first().click();
  await expect(list.locator('.ap-xlist__row.is-open')).toHaveCount(1);
  await expect(list.locator('.ap-xlist__body').first()).toBeVisible();
});

test('expandable rows keep the pointer cursor across every cell', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST);
  const cursors = await list
    .locator('tr.ap-xlist__row.is-expandable > td')
    .evaluateAll(els => els.map(el => getComputedStyle(el).cursor));
  expect(cursors.length).toBeGreaterThan(20);
  expect(new Set(cursors)).toEqual(new Set(['pointer']));
});

test('reveal ids stay unique across the mixed lists on the page', async ({
  page,
}) => {
  await page.goto(PAGE);
  // Three ExpandableList demos and the DemoXList all stamp ap-xlist-<n>-<i>
  // reveal ids; one shared counter must keep them collision-free.
  const ids = await page
    .locator('[id^="ap-xlist-"]')
    .evaluateAll(els => els.map(el => el.id));
  expect(ids.length).toBeGreaterThan(10);
  expect(new Set(ids).size).toBe(ids.length);
});
