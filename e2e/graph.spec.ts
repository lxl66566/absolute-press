import { expect, test } from 'playwright/test';

/**
 * Related-articles graph (d3 force/zoom/drag) + block order + pointer
 * cursor affordances. Runs against the built demo site (dist/) on 4173;
 * see playwright.config.ts for the preview webServers.
 */

const ORIGIN = 'http://127.0.0.1:4173';
// Graph fixture page: guide/deploy.html has exactly two neighbors (faq and
// the site home) that also reference each other, so the payload carries the
// star edges plus one induced edge. Counts below are pinned to the docs'
// current link structure.
const TARGET = `${ORIGIN}/guide/deploy.html`;

/** Center the graph section in the viewport (bypasses actionability checks:
 * the force-layout dots never stop drifting, so locators are never stable). */
function scrollGraphIntoView(page: import('playwright/test').Page): void {
  void page.evaluate(() => {
    document
      .querySelector('.ap-related-graph__viewport')
      ?.scrollIntoView({ block: 'center' });
  });
}

/** The chart mount defers to a near-tail IntersectionObserver
 * (RelatedGraph: NEAR_ROOT_MARGIN), and guide pages are tall enough that the
 * article tail starts below it — scroll the section shell (rendered
 * immediately) into view so the d3 chunk loads and the svg appears. */
async function mountGraph(page: import('playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById('ap-related')?.scrollIntoView({ block: 'center' });
  });
  await expect(page.locator('#ap-related .ap-graph-svg')).toBeVisible();
}

test.describe('related articles graph', () => {
  test('renders nodes and edges for the one-degree neighborhood', async ({
    page,
  }) => {
    await page.goto(TARGET);
    await mountGraph(page);
    const svg = page.locator('#ap-related .ap-graph-svg');
    await expect(svg).toBeVisible();
    // deploy + faq + home as dots; star edges plus the induced faq--home
    // edge (payload RelatedLink.links).
    await expect(svg.locator('g.ap-graph-node:not(.is-current)')).toHaveCount(
      2,
    );
    await expect(svg.locator('g.ap-graph-node.is-current')).toHaveCount(1);
    await expect(svg.locator('line.ap-graph-edge')).toHaveCount(3);
  });

  test('wheel zoom changes the canvas transform', async ({ page }) => {
    await page.goto(TARGET);
    await mountGraph(page);
    const root = page.locator('#ap-related .ap-graph-root');
    await expect(root).toBeVisible();
    const before = await root.getAttribute('transform');
    await page.locator('#ap-related .ap-graph-svg').hover();
    await page.mouse.wheel(0, -240);
    await expect
      .poll(async () => root.getAttribute('transform'), { timeout: 3000 })
      .not.toBe(before);
  });

  test('initial fit zoom fills the canvas and keeps the one-hop labels', async ({
    page,
  }) => {
    await page.goto(TARGET);
    await mountGraph(page);
    const svg = page.locator('#ap-related .ap-graph-svg');
    await expect(svg).toBeVisible();
    const fitK = Number(await svg.getAttribute('data-fit-k'));
    expect(fitK).toBeGreaterThan(0);
    const transform = await page
      .locator('#ap-related .ap-graph-root')
      .getAttribute('transform');
    const k = Number(/scale\(([\d.e+-]+)\)/.exec(transform ?? '')?.[1] ?? 0);
    // The view opens exactly at the fit scale; only a gesture moves it.
    expect(Math.abs(k - fitK)).toBeLessThan(0.01);
    // At fit scale only the one-hop ring is labeled (M9): the every-label
    // flag waits until the reader zooms in past the fit.
    await expect(svg).not.toHaveClass(/is-labels-visible/);
  });

  test('zooming in past the fit reveals labels, zooming out hides them', async ({
    page,
  }) => {
    await page.goto(TARGET);
    await mountGraph(page);
    const svg = page.locator('#ap-related .ap-graph-svg');
    await expect(svg).toBeVisible();
    await expect(svg).not.toHaveClass(/is-labels-visible/);
    await svg.hover();
    // One notch in: k rises above the fit * LABEL_ZOOM_FACTOR threshold.
    await page.mouse.wheel(0, -240);
    await expect(svg).toHaveClass(/is-labels-visible/);
    // Two notches out drop back below it.
    await page.mouse.wheel(0, 480);
    await expect(svg).not.toHaveClass(/is-labels-visible/);
  });

  test('dragging a node moves it and does not navigate', async ({ page }) => {
    await page.goto(TARGET);
    await mountGraph(page);
    const node = page.locator('g.ap-graph-node:not(.is-current)').first();
    await expect(node).toBeVisible();
    const circle = node.locator('circle');
    // The graph sits at the article's end; bring it into the viewport so
    // raw mouse coordinates can actually hit the dot. The dots drift
    // forever, so locator actionability (scrollIntoViewIfNeeded) would
    // never settle — scroll the section directly instead.
    await scrollGraphIntoView(page);
    // Aim at the dot's center: boundingBox() x/y is the top-left corner.
    const box = (await circle.boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const posOf = async (): Promise<[number, number]> => {
      const m = /translate\(([-\d.e+]+),([-\d.e+]+)\)/.exec(
        (await node.getAttribute('transform')) ?? '',
      );
      return [Number(m?.[1] ?? 0), Number(m?.[2] ?? 0)];
    };
    const before = await posOf();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 90, cy + 70, { steps: 8 });
    await page.mouse.up();
    // Drift is a few px per second and cannot fake a ~114px displacement.
    const after = await posOf();
    expect(
      Math.hypot(after[0] - before[0], after[1] - before[1]),
    ).toBeGreaterThan(50);
    // A drag past the click slop must not trigger navigation.
    expect(page.url()).toBe(TARGET);
  });

  test('clicking a neighbor node navigates to its article', async ({
    page,
  }) => {
    await page.goto(TARGET);
    await mountGraph(page);
    // Neighbors are sorted by refs desc, then route asc: faq and home both
    // carry refs 1, so faq (/guide/faq.html < /index.html) comes first.
    const node = page.locator('g.ap-graph-node:not(.is-current)').first();
    await expect(node).toBeVisible();
    await scrollGraphIntoView(page);
    // The dot never stops drifting, so locator click's stability check
    // would never settle; drive the mouse directly instead. The drift is
    // far below the 4px click slop, so this stays a click, not a drag.
    const box = (await node.locator('circle').boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    // Mark the window: soft navigation swaps the body but keeps the
    // document, so a full reload would wipe this.
    await page.evaluate(() => {
      (window as unknown as { __apSpecMarker?: number }).__apSpecMarker = 1;
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForURL('**/guide/faq.html');
    // Chrome survived the swap: the window marker proves no full page
    // load happened, and the mounted navbar / sidebar still render (the
    // fixed bar lives inside the zero-height #ap-nav mount container).
    const marker = await page.evaluate(
      () => (window as unknown as { __apSpecMarker?: number }).__apSpecMarker,
    );
    expect(marker).toBe(1);
    // The first nav is the desktop bar; the second is the hidden mobile
    // drawer panel.
    await expect(page.locator('#ap-nav nav').first()).toBeVisible();
    await expect(page.locator('#ap-sidebar nav')).toBeVisible();
  });

  test('related block sits above the comment section', async ({ page }) => {
    await page.goto(TARGET);
    await mountGraph(page);
    await expect(page.locator('#ap-related')).toBeVisible();
    const order = await page.evaluate(() => {
      const related = document.getElementById('ap-related');
      const comments = document.querySelector<HTMLElement>(
        '#ap-content > div[data-ap-island="Giscus"]',
      );
      if (!related || !comments) return 'missing';
      return related.compareDocumentPosition(comments) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? 'before'
        : 'after';
    });
    expect(order).toBe('before');
  });

  test('prefers-reduced-motion keeps the layout static', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(TARGET);
    await mountGraph(page);
    const node = page.locator('g.ap-graph-node:not(.is-current)').first();
    await expect(node).toBeVisible();
    const before = await node.getAttribute('transform');
    await page.waitForTimeout(700);
    // No Brownian drift: positions must be byte-identical.
    expect(await node.getAttribute('transform')).toBe(before);
  });
});

test.describe('pointer cursor affordances', () => {
  test('back-to-top button and tab headers show cursor:pointer', async ({
    page,
  }) => {
    await page.goto(`${ORIGIN}/guide/markdown.html`);
    const cursorOf = (
      locator: ReturnType<typeof page.locator>,
    ): Promise<string> => locator.evaluate(el => getComputedStyle(el).cursor);

    // Tab headers are plain labels over CSS-only radios.
    const tab = page.locator('.ap-tabs > label').first();
    await expect(tab).toBeVisible();
    expect(await cursorOf(tab)).toBe('pointer');

    // Back-to-top appears after scrolling past 480px.
    await page.evaluate(() => window.scrollTo(0, 1200));
    const backToTop = page.getByRole('button', { name: '返回顶部' });
    await expect(backToTop).toBeVisible();
    expect(await cursorOf(backToTop)).toBe('pointer');
  });
});
