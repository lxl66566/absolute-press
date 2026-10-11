import { expect, test } from 'playwright/test';

/**
 * ExpandableList island against the built docs site (/guide/islands):
 * static items collapse into a toolbar + rows UI after hydration; search
 * filters, header-click sort reorders, and per-row toggles work; a ZoomedImg
 * nested inside an entry hydrates and re-hydrates on filter re-entry.
 */

const PAGE = '/guide/islands';
const LIST = '.ap-xlist';

test('static entries collapse into the toolbar UI after hydration', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST).first();
  const toolbar = list.locator('.ap-xlist__toolbar');
  await expect(toolbar).toBeVisible();
  // Static h3 markup is gone; rows carry the interactive toggle.
  await expect(list.locator('.ap-xlist__item-title')).toHaveCount(0);
  await expect(list.locator('.ap-xlist__row')).toHaveCount(4);
  await expect(list.locator('.ap-xlist__count')).toHaveText('4 / 4 条');
  // Collapsed by default: no row is open.
  await expect(list.locator('.ap-xlist__row.is-open')).toHaveCount(0);
});

test('search filters entries by title and body substrings', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST).first();
  const search = list.locator('.ap-xlist__search');
  // Title hit.
  await search.fill('容器');
  await expect(list.locator('.ap-xlist__row')).toHaveCount(1);
  await expect(list.locator('.ap-xlist__count')).toHaveText('1 / 4 条');
  // Body hit (word only appears inside an entry's fenced code block).
  await search.fill('行内代码');
  await expect(list.locator('.ap-xlist__count')).toHaveText('1 / 4 条');
  // Multi-term AND.
  await search.fill('island 嵌套');
  await expect(list.locator('.ap-xlist__count')).toHaveText('1 / 4 条');
  // No match: empty state + zero count.
  await search.fill('不存在的词条');
  await expect(list.locator('.ap-xlist__empty')).toBeVisible();
  await expect(list.locator('.ap-xlist__count')).toHaveText('0 / 4 条');
  await search.fill('');
  await expect(list.locator('.ap-xlist__count')).toHaveText('4 / 4 条');
});

test('header clicks cycle column sorts on the columns list', async ({
  page,
}) => {
  await page.goto(PAGE);
  // Third list on the page: the `:columns` demo (游戏名/时长/剧情/画风/备注).
  const list = page.locator(LIST).nth(2);
  const titles = () => list.locator('.ap-xlist__title').allTextContents();
  const sorter = list.locator('.ap-xlist__sorter');
  // Title column: asc -> desc -> back to the written order.
  await sorter.first().click();
  const ascending = await titles();
  await sorter.first().click();
  const descending = await titles();
  // Locale-independent invariants: same rows, exact reverse order.
  expect(ascending).toEqual(descending.toReversed());
  await sorter.first().click();
  await expect(titles()).resolves.toEqual(['KARAKARA', 'サルテ']);
  // 剧情 column sorts by cell text with numeric digit runs (3.3 < 7.7).
  await sorter.nth(2).click();
  await expect(titles()).resolves.toEqual(['KARAKARA', 'サルテ']);
  await expect(list.locator('.ap-xlist__th').nth(2)).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
});

test('single-row toggles', async ({ page }) => {
  await page.goto(PAGE);
  const list = page.locator(LIST).first();
  const toggle = list.locator('.ap-xlist__toggle').first();
  await toggle.click();
  await expect(list.locator('.ap-xlist__row.is-open')).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(list.locator('.ap-xlist__body').first()).toBeVisible();
  await toggle.click();
  await expect(list.locator('.ap-xlist__row.is-open')).toHaveCount(0);
});

test('ZoomedImg nested in an entry hydrates and survives filter re-entry', async ({
  page,
}) => {
  await page.goto(PAGE);
  const list = page.locator(LIST).first();
  // The nested island lives in the third entry (嵌套 island).
  await list.locator('.ap-xlist__toggle').nth(2).click();
  const zoomed = list.locator('.ap-xlist__body img.cursor-zoom-in');
  await expect(zoomed).toHaveCount(1);

  // Filter the entry out and back in: the row DOM is rebuilt, so the nested
  // island must be re-hydrated (click-to-zoom cursor class present again).
  const search = list.locator('.ap-xlist__search');
  await search.fill('嵌套 island');
  await expect(zoomed).toHaveCount(1);
  await search.fill('');
  await expect(zoomed).toHaveCount(1);
});
