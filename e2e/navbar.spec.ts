import { expect, test } from 'playwright/test';

/**
 * Navbar dropdown overflow contract (.ap-nav-drop in theme.css +
 * NavEntry's fixed flyout placement): top-level panels cap below the navbar
 * edge and scroll internally, and nested flyouts escape the scrollable
 * parent panel via JS positioning instead of being clipped by it.
 * Menus must also never outlive the visit: client-side navigation keeps the
 * navbar mounted, so open panels must close when a row click moves the page.
 */

const NAV_BOTTOM = 56; // --ap-nav-h (3.5rem)
const GUIDE_LABEL = '指南'; // docs guide catalog (15 rows + a nested group)
// Desktop nav bar only: the mobile drawer tree lives in its own <nav> under
// #ap-nav too, and its top-level rows would collide in strict mode.
const TOP_ITEM = '#ap-nav header nav > ul > li';

test('top-level dropdown caps below the navbar and scrolls', async ({
  page,
}) => {
  // Short viewport: the guide catalog cannot fit into one panel. Width stays
  // above the lg breakpoint where the desktop nav links show.
  await page.setViewportSize({ width: 1100, height: 300 });
  await page.goto('/');
  // Top-level navbar rows open their panel on li hover whether or not the
  // row itself is a link (folder rows navigate to the folder index now).
  const guide = page.locator(TOP_ITEM, { hasText: GUIDE_LABEL });
  await guide.hover();
  const panel = guide.locator('ul').first();
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  // Opens flush with the navbar's bottom edge (1px border inside h-14).
  expect(box!.y).toBeGreaterThanOrEqual(NAV_BOTTOM - 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(300);
  // The catalog overflows into an internal scrollbar instead of the page.
  expect(await panel.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
});

test('nested flyout escapes the scrollable parent panel', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto('/');
  const guide = page.locator(TOP_ITEM, { hasText: GUIDE_LABEL });
  await guide.hover();
  const panel = guide.locator('ul').first();
  await expect(panel).toBeVisible();
  const advanced = panel.locator('li', { hasText: 'advanced' }).first();
  await advanced.hover();
  const flyout = advanced.locator('ul').first();
  await expect(flyout).toBeVisible();
  const flyBox = await flyout.boundingBox();
  expect(flyBox).not.toBeNull();
  expect(flyBox!.y).toBeGreaterThanOrEqual(NAV_BOTTOM - 1);
  expect(flyBox!.y + flyBox!.height).toBeLessThanOrEqual(600);
  // The flyout must really receive hits at its own location: an absolutely
  // positioned flyout gets clipped by the scrollable panel exactly here.
  const link = flyout.locator('a', { hasText: '深层页面' });
  await expect(link).toBeVisible();
  const linkBox = await link.boundingBox();
  expect(linkBox).not.toBeNull();
  const hitInside = await flyout.evaluate(
    (fly, pt) => {
      const el = document.elementFromPoint(pt.x, pt.y);
      return el !== null && fly.contains(el);
    },
    { x: linkBox!.x + linkBox!.width / 2, y: linkBox!.y + linkBox!.height / 2 },
  );
  expect(hitInside).toBe(true);
});

test('dropdown closes after client-side navigation from a panel row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto('/');
  const guide = page.locator(TOP_ITEM, { hasText: GUIDE_LABEL });
  await guide.hover();
  const panel = guide.locator('ul').first();
  await expect(panel).toBeVisible();
  // Click a real panel row link (not the closed nested flyout's hidden
  // rows, which also match li > a). The pointer stays parked where the
  // panel was — no pointerleave fires — and the chrome survives the SPA
  // swap, so the menu must be closed by the navigation itself, not by the
  // pointer moving away.
  await panel.locator('li > a', { hasText: '快速开始' }).click();
  await expect(page).not.toHaveURL(/\/$/);
  await expect(panel).not.toBeVisible();
});
