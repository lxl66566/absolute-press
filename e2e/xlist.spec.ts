import { expect, test } from 'playwright/test';

/**
 * The docs-site DemoXList island (guide/islands): the only rendered XList in
 * the docs build, exercising the data-driven toolkit end to end — a text
 * column, numeric sortValue columns, the per-column sortable whitelist, the
 * exclusion filter, search and expandable slot bodies.
 */

const PAGE = '/guide/islands';
// Fourth .ap-xlist on the page: the XList section's DemoXList (after three
// ExpandableList demos).
const LIST = '.ap-xlist';

test('DemoXList renders the data-driven table with a sortable whitelist', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST).nth(3);
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
  const list = page.locator(LIST).nth(3);
  await list.locator('.ap-xlist__sorter').nth(2).click();
  await expect(
    list.locator('.ap-xlist__title').allTextContents(),
  ).resolves.toEqual(['fzf', 'ripgrep', 'bat', 'fd', 'jq', 'eza', 'xsv']);
});

test('the exclusion filter hides flagged rows and the count follows', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST).nth(3);
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
  const list = page.locator(LIST).nth(3);
  await list.locator('.ap-xlist__search').fill('fzf');
  await expect(list.locator('.ap-xlist__row')).toHaveCount(1);
  await list.locator('.ap-xlist__search').fill('');
  await list.locator('.ap-xlist__toggle').first().click();
  await expect(list.locator('.ap-xlist__row.is-open')).toHaveCount(1);
  await expect(list.locator('.ap-xlist__body').first()).toBeVisible();
});
