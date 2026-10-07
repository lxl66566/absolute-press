import { expect, test, type Locator } from 'playwright/test';

/**
 * Sidebar folder-row contract (src/client/theme/SideBar.tsx):
 * - the folder row is a link to the folder's index.md; the chevron is a
 *   separate <button> owning collapse of the whole subtree
 * - the active path auto-expands once per load/navigation; a manual
 *   collapse of the containing group must stick
 * - nesting works at any depth (docs: guide/advanced/deep.html; the
 *   index-less advanced/ folder doubles as the plain-heading row case)
 *
 * Collapsed groups hide children via 0-height tracks + overflow clipping,
 * so hiding is asserted through geometry (toBeVisible ignores ancestor
 * clipping and would false-positive on the clipped links).
 */

const COLLAPSED_GROUP = '#ap-sidebar .ap-sidebar-group.ap-collapsed';

/** Height of a group's ul (0 = fully collapsed subtree). */
async function groupHeight(locator: Locator): Promise<number> {
  return locator.evaluate(
    (el: HTMLElement) => el.getBoundingClientRect().height,
  );
}

/** The collapse ul owned by a folder row (its li's first group). */
function groupOf(row: Locator): Locator {
  return row.locator('..').locator('.ap-sidebar-group').first();
}

test('folder row navigates to the folder index and highlights it', async ({
  page,
}) => {
  await page.goto('/guide/encrypt.html');
  // Scope to the rail: the mobile drawer renders the same tree with the
  // same row classes inside #ap-nav. Locate by href — 指南 as a substring
  // also appears in sibling rows (写作指南 / 部署指南 …).
  const folderRow = page.locator(
    '#ap-sidebar a.ap-sidebar-row__link[href$="guide/index.html"]',
  );
  await expect(folderRow).toHaveCount(1);
  await folderRow.click();
  await expect(page).toHaveURL(/guide\/index\.html$/);
  // Same row is the active page after navigation.
  await expect(
    page.locator(
      '#ap-sidebar .ap-sidebar-row__link.ap-sidebar-row__link--active',
    ),
  ).toHaveAttribute('href', /guide\/index\.html$/);
});

test('index pages do not repeat as sidebar children', async ({ page }) => {
  await page.goto('/guide/index.html');
  const group = page.locator('#ap-sidebar li', {
    has: page.locator('a[href$="guide/index.html"]'),
  });
  // The group's own subtree contains no second link to the index page.
  expect(await group.locator('a[href$="guide/index.html"]').count()).toBe(1);
});

test('chevron collapses the group containing the current page and stays collapsed', async ({
  page,
}) => {
  await page.goto('/guide/advanced/deep.html');
  // advanced/ has no index.md: the row is a plain heading plus chevron.
  const advancedChevron = page
    .locator('#ap-sidebar .ap-sidebar-row')
    .filter({ hasText: 'advanced' })
    .locator('.ap-sidebar-row__chevron');
  await expect(advancedChevron).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(COLLAPSED_GROUP)).toHaveCount(0);

  await advancedChevron.click();
  await expect(advancedChevron).toHaveAttribute('aria-expanded', 'false');
  const collapsed = page.locator(COLLAPSED_GROUP);
  await expect(collapsed).toHaveCount(1);
  // The whole subtree collapses to zero height (children clipped); poll
  // because the 0fr track animates over ~160ms.
  await expect.poll(() => groupHeight(collapsed), { timeout: 2000 }).toBe(0);
  // The old bug: auto-expand re-forcing must not resurrect the group.
  await page.waitForTimeout(400);
  await expect(advancedChevron).toHaveAttribute('aria-expanded', 'false');
  expect(await groupHeight(collapsed)).toBe(0);

  // State persists across a reload of a page outside the group…
  await page.goto('/index.html');
  await expect(page.locator(COLLAPSED_GROUP)).toHaveCount(1);
  // …but navigating into the group auto-expands it again.
  await page.goto('/guide/advanced/deep.html');
  await expect(page.locator(COLLAPSED_GROUP)).toHaveCount(0);
});

test('multi-level nesting: inner and outer groups collapse independently', async ({
  page,
}) => {
  await page.goto('/guide/advanced/deep.html');
  const rows = page.locator('#ap-sidebar .ap-sidebar-row');
  // 指南 (outer, index link row) + advanced (inner, no index) + the page link.
  const guideRow = rows.filter({ hasText: '指南' });
  const advancedRow = rows.filter({ hasText: 'advanced' });
  await expect(guideRow).toHaveCount(1);
  await expect(advancedRow).toHaveCount(1);
  const deepLink = page
    .locator('.ap-sidebar-tree a')
    .filter({ hasText: '深层页面' });
  await expect(deepLink).toHaveCount(1);

  const guideGroup = groupOf(guideRow);
  const advancedGroup = groupOf(advancedRow);
  const waitForCollapse = async (group: Locator): Promise<void> => {
    await expect.poll(() => groupHeight(group), { timeout: 2000 }).toBe(0);
  };

  // Collapsing the outer group collapses the whole subtree…
  await guideRow.locator('.ap-sidebar-row__chevron').click();
  await expect(guideGroup).toHaveClass(/ap-collapsed/);
  await waitForCollapse(guideGroup);

  // …and expanding it restores the inner group as it was.
  await guideRow.locator('.ap-sidebar-row__chevron').click();
  await expect(guideGroup).not.toHaveClass(/ap-collapsed/);
  await expect
    .poll(() => groupHeight(guideGroup), { timeout: 2000 })
    .toBeGreaterThan(0);
  await expect(deepLink).toBeVisible();

  // The inner chevron still works on its own subtree only.
  await advancedRow.locator('.ap-sidebar-row__chevron').click();
  await expect(advancedGroup).toHaveClass(/ap-collapsed/);
  await waitForCollapse(advancedGroup);
  expect(await groupHeight(guideGroup)).toBeGreaterThan(0);
});

test('chevron is keyboard operable (Enter toggles)', async ({ page }) => {
  await page.goto('/guide/advanced/deep.html');
  const chevron = page
    .locator('#ap-sidebar .ap-sidebar-row')
    .filter({ hasText: 'advanced' })
    .locator('.ap-sidebar-row__chevron');
  await chevron.focus();
  await page.keyboard.press('Enter');
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(chevron).toHaveAttribute('aria-expanded', 'true');
});

test('folder rows survive the 375px drawer', async ({ page }) => {
  page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/guide/advanced/deep.html');
  await page.getByRole('button', { name: '打开菜单' }).click();
  const drawer = page.locator('#ap-nav .ap-drawer-panel');
  await expect(drawer).toHaveClass(/ap-open/);
  const deepLink = page
    .locator('.ap-drawer-tree a')
    .filter({ hasText: '深层页面' });
  await expect(deepLink).toHaveCount(1);
  await deepLink.click();
  // Navigating from a drawer link closes the drawer on the new page.
  await expect(page).toHaveURL(/deep\.html$/);
  await expect(drawer).not.toHaveClass(/ap-open/);
});
