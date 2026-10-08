import { expect, type Page, test } from 'playwright/test';

/**
 * Dev-mode FOUC contract (see fouc.spec.ts for the build-time twin). Under
 * `vite dev`, CSS is served as JS modules and the style tag only appears
 * once the entry executes — every MPA navigation then paints the parsed
 * but unstyled HTML first. The framework's dev middleware therefore injects
 * the entry's static CSS as render-blocking `<link ?direct>` tags (vite
 * answers `?direct` with raw CSS). These tests pin that contract:
 *
 * 1. Structural: the dev-served head carries `?direct` stylesheet links for
 *    the entry's static CSS (uno virtual css + app styles) ahead of the
 *    payload / module scripts, and each link responds with text/css.
 * 2. Behavioral: with every CSS response delayed, the injected links report
 *    renderBlockingStatus "blocking" and first paint waits for them — on
 *    cold loads and on in-site navigation.
 */

const DEV = 'http://127.0.0.1:5173';

/** Render-blocking `?direct` links of one dev-served page head. */
async function directLinks(page: Page, path: string): Promise<string[]> {
  const html = await (await page.request.get(`${DEV}${path}`)).text();
  const head = html.slice(0, html.indexOf('</head>'));
  const links = [...head.matchAll(/<link rel="stylesheet"[^>]*>/g)].map(
    m => m[0],
  );
  const direct = links.filter(l => l.includes('?direct'));
  // Injected links must precede the payload and the entry module script.
  for (const link of direct) {
    const at = html.indexOf(link);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(html.indexOf('id="__AP_DATA__"'));
    expect(at).toBeLessThan(html.indexOf('<script type="module"'));
  }
  return direct;
}

test.describe('dev fouc: head delivery contract', () => {
  test('dev html head carries raw-css render-blocking links', async ({
    page,
  }) => {
    const links = await directLinks(page, '/guide/advanced/deep');
    // uno virtual css + at least theme.css (app modules may add more).
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.some(l => l.includes('__uno.css?direct'))).toBe(true);
    expect(links.some(l => l.includes('/styles/theme.css?direct'))).toBe(true);
    for (const link of links) {
      expect(link).not.toMatch(/\bmedia=/);
      expect(link).not.toMatch(/\bonload=/);
    }
    // Each injected URL must answer raw CSS, not the JS module wrapper.
    const hrefs = links.map(l => /href="([^"]+)"/.exec(l)?.[1] ?? '');
    const responses = await Promise.all(
      hrefs.map(h => page.request.get(`${DEV}${h}`)),
    );
    for (const res of responses) {
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('text/css');
    }
  });
});

async function paintWaitsForCss(page: Page): Promise<void> {
  // Cold dev servers compile on demand; give the paint entry generous room.
  await expect
    .poll(
      async () =>
        page.evaluate(() => performance.getEntriesByType('paint').length),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const timing = await page.evaluate(() => {
    const paints = performance.getEntriesByType('paint').map(e => e.startTime);
    const css = (
      performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    )
      .filter(e => /\.css/.test(e.name))
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
  // Dev injects uno + theme as separate render-blocking links (katex joins
  // them on math pages).
  expect(timing.blocking.length).toBeGreaterThanOrEqual(2);
  expect(timing.firstPaint).not.toBeNull();
  expect(timing.firstPaint!).toBeGreaterThanOrEqual(
    Math.max(...timing.blocking.map(s => s.end)) - 2,
  );
}

test.describe('dev fouc: first paint waits for stylesheets under delayed css', () => {
  const CSS_DELAY_MS = 300;

  function delayCss(page: Page): void {
    // Dev css URLs may carry `?direct`, so match the extension, not the end.
    void page.route(/\.css/, async route => {
      await new Promise(r => setTimeout(r, CSS_DELAY_MS));
      await route.continue();
    });
  }

  test('dev cold load', async ({ page }) => {
    delayCss(page);
    await page.goto(`${DEV}/guide/getting-started`, {
      waitUntil: 'load',
    });
    await paintWaitsForCss(page);
  });

  test('dev content-link navigation', async ({ page }) => {
    delayCss(page);
    await page.goto(`${DEV}/`, { waitUntil: 'load' });
    const firstLink = page.locator('#ap-content a[href^="guide/"]').first();
    // The landing's link set changes with the docs; follow wherever the
    // first content link points instead of hardcoding a target.
    const target = await firstLink.getAttribute('href');
    expect(target).toBeTruthy();
    await firstLink.click();
    // Pin the new document before reading its paint timing: the cold dev
    // server compiles the target graph on demand, so the old document can
    // linger a while before the navigation commits.
    await page.waitForURL(`**/${target}`);
    await page.waitForLoadState('load');
    await paintWaitsForCss(page);
  });
});
