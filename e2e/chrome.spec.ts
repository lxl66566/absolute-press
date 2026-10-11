import { expect, test } from 'playwright/test';

/**
 * Externalized chrome asset (build/chrome-asset.ts): build payloads drop
 * site.icons/navbar/sidebar from the inline `__AP_DATA__` and reference a
 * content-hashed shared module instead; the client loads it before the
 * chrome mounts and merges it back at every pagePayload() read. These
 * specs pin that contract against the built docs site (127.0.0.1:4173):
 * the slim inline payload, the one-fetch-per-locale caching across soft
 * navigations, and the locale crossing loading the target's module.
 */

const PAGE = 'http://127.0.0.1:4173/guide/markdown';

test('build payloads reference the chrome module and mount chrome from it', async ({
  page,
}) => {
  await page.goto(PAGE);
  const inline = await page.evaluate(() => {
    const el = document.getElementById('__AP_DATA__');
    return {
      chrome: (JSON.parse(el?.textContent ?? '{}') as { chrome?: string })
        .chrome,
      link: document
        .querySelector<HTMLLinkElement>(
          'link[rel="modulepreload"][href*="chrome-"]',
        )
        ?.getAttribute('href'),
    };
  });
  expect(inline.chrome).toMatch(/^(\.\.\/)?assets\/chrome-[0-9a-f]{8}\.js$/);
  expect(inline.link).toBe(inline.chrome);
  // The chrome mounts from the merged module: the rail renders its tree.
  await expect(
    page.locator('#ap-sidebar a.ap-sidebar-row__link').first(),
  ).toBeVisible();
});

test('the chrome asset is fetched once and cached across soft navigations', async ({
  page,
}) => {
  const chromeRequests: string[] = [];
  page.on('request', req => {
    if (/\/assets\/chrome-[0-9a-f]{8}\.js$/.test(req.url())) {
      chromeRequests.push(req.url());
    }
  });
  await page.goto(PAGE);
  await expect(
    page.locator('#ap-sidebar a.ap-sidebar-row__link').first(),
  ).toBeVisible();
  // Same-locale soft navigation: payload and head rerun, asset must not.
  await page
    .locator('#ap-sidebar a.ap-sidebar-row__link[href$="guide/"]')
    .click();
  await expect(page).toHaveURL(/\/guide\/$/);
  await expect(
    page.locator('#ap-sidebar a.ap-sidebar-row__link').first(),
  ).toBeVisible();
  expect(chromeRequests).toHaveLength(1);
});

test('crossing locales loads the target locale chrome before the swap', async ({
  page,
}) => {
  const chromeRequests: string[] = [];
  page.on('request', req => {
    if (/\/assets\/chrome-[0-9a-f]{8}\.js$/.test(req.url())) {
      chromeRequests.push(req.url());
    }
  });
  await page.goto(PAGE);
  await expect(
    page.locator('#ap-sidebar a.ap-sidebar-row__link').first(),
  ).toBeVisible();
  // The locale switcher crosses locales through a soft navigation.
  await page.getByRole('button', { name: '切换语言' }).click();
  await page.locator('#ap-nav a').filter({ hasText: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/guide\/markdown\/?$/);
  // The EN rail is the EN module's tree (merged after the locale crossing)
  // and the target locale's asset joined the default's in the module cache.
  const tree = await page.evaluate(
    () => document.querySelectorAll('#ap-sidebar .ap-sidebar-row').length,
  );
  expect(tree).toBeGreaterThan(0);
  expect(new Set(chromeRequests).size).toBe(2);
});
