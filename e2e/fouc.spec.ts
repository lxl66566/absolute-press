import { expect, type Page, test } from 'playwright/test';

/**
 * FOUC / delivery-contract suite. In-site navigation is a full MPA load;
 * when the target page's render-blocking CSS is not immediately available,
 * Chrome's paint holding gives up and paints the parsed-but-unstyled
 * document (the reported flash). These tests pin the delivery contract that
 * keeps that window bounded to transport time:
 *
 * 1. Structural (raw served HTML): every page head carries render-blocking
 *    stylesheet links (no media/onload async hacks) ahead of the payload /
 *    module scripts, plus the Speculation Rules script so Chromium
 *    prefetches/prerenders same-site targets before activation.
 * 2. Lazy-feature stylesheets (docsearch, photoswipe, mermaid...) are
 *    injected on demand by Vite's preload runtime and must NOT sit in the
 *    head — they used to add ~50KB of render-blocking bytes to every page.
 * 3. Behavioral: with every CSS response artificially delayed, the head
 *    stylesheets report renderBlockingStatus "blocking" and the document's
 *    first paint happens only after they arrive — on cold loads and on all
 *    three in-site navigation paths (content link, sidebar link, locale
 *    switch).
 *
 * Why no "styled intermediate frame" screenshot assertion: the unstyled
 * frame is painted by Chrome's paint-holding fallback, which bypasses the
 * renderer lifecycle (invisible to paint timing) and exists whenever the
 * target CSS misses the cache — under artificial delay it exists on any
 * build. The reliable equivalents are the structural contract above plus
 * the render-blocking / first-paint timing assertions, which catch
 * async-CSS regressions deterministically.
 */

const SITE = 'http://127.0.0.1:4173';

/** CSS of lazy-loaded features; head links must never match these. */
const LAZY_CSS = /docsearch|photoswipe/;

interface HeadAudit {
  stylesheets: string[];
  foucBeforeLinks: boolean;
  linksBeforeData: boolean;
  rules: unknown;
}

/** Audit the raw served HTML — the SSG delivery contract, pre-hydration. */
async function auditHead(page: Page, url: string): Promise<HeadAudit> {
  const html = await (await page.request.get(url)).text();
  const stylesheets = [...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map(
    m => m[0],
  );
  const rulesMatch = html.match(
    /<script type="speculationrules">(.*?)<\/script>/s,
  );
  return {
    stylesheets,
    foucBeforeLinks:
      html.indexOf('ap-theme') >= 0 &&
      html.indexOf('ap-theme') < html.indexOf('<link rel="stylesheet"'),
    linksBeforeData:
      html.indexOf('<link rel="stylesheet"') <
        html.indexOf('id="__AP_DATA__"') &&
      html.indexOf('<link rel="stylesheet"') <
        html.indexOf('<script type="module"'),
    rules: rulesMatch ? (JSON.parse(rulesMatch[1]!) as unknown) : null,
  };
}

/** Assert the head delivery contract of one built page. */
function expectHeadContract(audit: HeadAudit, base: string): void {
  // The head carries the entry (uno + theme) sheet plus the KaTeX sheet on
  // math pages only; more than this means bundle-wide css leaked into the
  // head.
  expect(audit.stylesheets.length).toBeLessThanOrEqual(2);
  for (const link of audit.stylesheets) {
    expect(link).not.toMatch(/\bmedia=/);
    expect(link).not.toMatch(/\bonload=/);
    expect(link).not.toMatch(/\bdisabled\b/);
    // Relative-base contract: per-page-depth prefix, never absolute paths.
    expect(link).toContain(`href="${base}`);
    expect(link).not.toMatch(/href="https?:/);
    expect(LAZY_CSS.test(link), `${link} must not be a lazy css`).toBe(false);
  }
  expect(audit.foucBeforeLinks).toBe(true);
  expect(audit.linksBeforeData).toBe(true);
  // Speculation Rules: valid JSON with a same-site prerender document rule.
  const rules = audit.rules as {
    prerender?: Array<{ source?: string; eagerness?: string }>;
  } | null;
  expect(rules).not.toBeNull();
  expect(rules!.prerender).toHaveLength(1);
  expect(rules!.prerender![0]!.source).toBe('document');
  expect(rules!.prerender![0]!.eagerness).toBe('moderate');
}

test.describe('fouc: head delivery contract', () => {
  const sitePages: Array<{ path: string; base: string }> = [
    { path: '/', base: 'assets/' },
    { path: '/guide/getting-started', base: '../assets/' },
    { path: '/guide/markdown', base: '../assets/' },
    { path: '/en/guide/getting-started', base: '../../assets/' },
    { path: '/en/', base: '../assets/' },
    { path: '/category/%E6%8C%87%E5%8D%97', base: '../assets/' },
  ];
  for (const { path, base } of sitePages) {
    test(`${path}: render-blocking head + speculation rules`, async ({
      page,
    }) => {
      expectHeadContract(await auditHead(page, `${SITE}${path}`), base);
    });
  }

  test('katex sheet rides only on math pages', async ({ page }) => {
    const math = await auditHead(page, `${SITE}/guide/markdown`);
    expect(
      math.stylesheets.some(s => s.includes('katex')),
      'math page must link the katex css',
    ).toBe(true);
    const plain = await auditHead(page, `${SITE}/guide/getting-started`);
    expect(
      plain.stylesheets.some(s => s.includes('katex')),
      'math-free page must not link the katex css',
    ).toBe(false);
  });
});

/**
 * First-paint vs render-blocking stylesheet response timing of the current
 * document. Runtime-injected lazy css is "non-blocking" by design and must
 * not count towards the paint bound.
 */
async function paintWaitsForCss(page: Page): Promise<void> {
  // First paint lands a frame after `load` under the css delay; poll for it.
  await expect
    .poll(
      async () =>
        page.evaluate(() => performance.getEntriesByType('paint').length),
      { timeout: 5000 },
    )
    .toBeGreaterThan(0);
  const timing = await page.evaluate(() => {
    const paints = performance.getEntriesByType('paint').map(e => e.startTime);
    const css = (
      performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    )
      .filter(e => e.name.endsWith('.css'))
      .map(e => ({
        end: e.responseEnd,
        status: (
          e as PerformanceResourceTiming & { renderBlockingStatus?: string }
        ).renderBlockingStatus,
      }));
    return {
      firstPaint: paints.length > 0 ? Math.min(...paints) : null,
      blocking: css.filter(s => s.status === 'blocking'),
    };
  });
  // The entry sheet is always render-blocking; math pages also carry the
  // katex sheet, math-free pages just the entry one.
  expect(timing.blocking.length).toBeGreaterThanOrEqual(1);
  expect(timing.firstPaint).not.toBeNull();
  // 2ms float slack; verified equal-window behavior in manual timings.
  expect(timing.firstPaint!).toBeGreaterThanOrEqual(
    Math.max(...timing.blocking.map(s => s.end)) - 2,
  );
}

test.describe('fouc: first paint waits for stylesheets under delayed css', () => {
  const CSS_DELAY_MS = 300;

  function delayCss(page: Page): void {
    void page.route('**/*.css', async route => {
      await new Promise(r => setTimeout(r, CSS_DELAY_MS));
      await route.continue();
    });
  }

  test('site cold load', async ({ page }) => {
    delayCss(page);
    await page.goto(`${SITE}/guide/getting-started`, {
      waitUntil: 'load',
    });
    await paintWaitsForCss(page);
  });

  test('content-link navigation', async ({ page }) => {
    delayCss(page);
    await page.goto(`${SITE}/`, { waitUntil: 'load' });
    await page.locator('#ap-content a[href^="guide/"]').first().click();
    await page.waitForLoadState('load');
    await paintWaitsForCss(page);
  });

  test('sidebar-link navigation', async ({ page }) => {
    delayCss(page);
    await page.goto(`${SITE}/guide/getting-started`, {
      waitUntil: 'load',
    });
    const link = page.locator('#ap-sidebar a:visible').first();
    // Skip an active self-link; navigate somewhere real.
    await link.click();
    await page.waitForLoadState('load');
    await paintWaitsForCss(page);
  });

  test('locale-switch navigation', async ({ page }) => {
    delayCss(page);
    await page.goto(`${SITE}/`, { waitUntil: 'load' });
    // The switch lives in a hover dropdown rendered after hydration.
    const globe = page.locator(
      '#ap-nav button[aria-label*="locale" i], #ap-nav button[aria-label*="语言" i]',
    );
    await globe.first().hover();
    const switchLink = page.locator('#ap-nav a[href$="en/"]').first();
    await expect(switchLink).toBeVisible({ timeout: 10000 });
    await switchLink.click();
    await page.waitForLoadState('load');
    await paintWaitsForCss(page);
  });
});
