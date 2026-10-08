import { expect, test } from 'playwright/test';

/**
 * ExpandableList island against the built docs site (/guide/islands):
 * static items collapse into a toolbar + rows UI after hydration; search
 * filters, sort reorders, expand/collapse-all and per-row toggles work; a
 * ZoomedImg nested inside an entry hydrates and re-hydrates on filter
 * re-entry.
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

test('sort reorders rows by title', async ({ page }) => {
  await page.goto(PAGE);
  const list = page.locator(LIST).first();
  const titles = () => list.locator('.ap-xlist__title').allTextContents();
  await list.locator('.ap-xlist__sort').selectOption('title-asc');
  const ascending = await titles();
  await list.locator('.ap-xlist__sort').selectOption('title-desc');
  const descending = await titles();
  // Locale-independent invariants: same rows, exact reverse order.
  expect(ascending).toEqual(descending.toReversed());
  expect(ascending.toSorted()).toEqual([
    '代码块',
    '嵌套 island',
    '嵌套容器',
    '空标题',
  ]);
  // Back to the original written order.
  await list.locator('.ap-xlist__sort').selectOption('default');
  await expect(titles()).resolves.toEqual([
    '嵌套容器',
    '代码块',
    '嵌套 island',
    '空标题',
  ]);
});

test('expand/collapse all and single-row toggles', async ({ page }) => {
  await page.goto(PAGE);
  const list = page.locator(LIST).first();
  await list.getByRole('button', { name: '全部展开' }).click();
  await expect(list.locator('.ap-xlist__row.is-open')).toHaveCount(4);
  await list.getByRole('button', { name: '全部收起' }).click();
  await expect(list.locator('.ap-xlist__row.is-open')).toHaveCount(0);

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
  await list.getByRole('button', { name: '全部展开' }).click();
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
