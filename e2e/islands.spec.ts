import { expect, type Page, test } from 'playwright/test';

/**
 * Interactive built-in islands against the built demo site (dist/):
 * - Mermaid: pan/zoom shell around the rendered svg (Ctrl+wheel zoom, drag
 *   pan, double-click reset) — plain wheel must keep scrolling the page.
 * - G2Plot: options pass through to the plot, so the native x-axis `slider`
 *   reaches the rendered chart (exposed via the container's __apPlot hook).
 */

const ORIGIN = 'http://127.0.0.1:4173';
const DIAGRAMS = `${ORIGIN}/guide/islands.html`;

/** Open /guide/islands.html and wait for the first mermaid render. */
async function mermaidCanvas(page: Page) {
  await page.goto(DIAGRAMS);
  const canvas = page.locator('.ap-mermaid__canvas').first();
  // Mermaid ships a big lazy chunk; give the first render room.
  await expect(canvas.locator('svg')).toBeVisible({ timeout: 20_000 });
  return canvas;
}

/** True when the chart sits at the untransformed fit view. */
function isIdentity(style: string): boolean {
  return style === '' || /translate\(0px, 0px\) scale\(1\)/.test(style);
}

test.describe('mermaid pan/zoom', () => {
  test('renders the reset affordance with a localized label', async ({
    page,
  }) => {
    const canvas = await mermaidCanvas(page);
    const reset = page.locator('.ap-mermaid__reset').first();
    await expect(reset).toBeAttached();
    await expect(reset).toHaveAttribute('aria-label', '重置缩放');
    await expect(canvas).not.toHaveClass(/ap-mermaid--error/);
  });

  test('ctrl+wheel zooms the chart, plain wheel keeps scrolling', async ({
    page,
  }) => {
    const canvas = await mermaidCanvas(page);
    const inner = canvas.locator('.ap-mermaid__inner');
    const transformOf = async (): Promise<string> =>
      (await inner.getAttribute('style')) ?? '';

    await canvas.hover();
    // Plain wheel: page scroll, no zoom.
    await page.mouse.wheel(0, 240);
    const afterPlainWheel = await transformOf();
    expect(afterPlainWheel).toBe('');

    // The scroll above moved the page under the cursor; hover again so the
    // ctrl+wheel lands on the chart.
    await canvas.hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -240);
    await page.keyboard.up('Control');
    await expect
      .poll(transformOf, { timeout: 3000 })
      .toMatch(/scale\(([\d.]+)\)/);
  });

  test('dragging pans the chart', async ({ page }) => {
    const canvas = await mermaidCanvas(page);
    const inner = canvas.locator('.ap-mermaid__inner');
    // Hover scrolls the chart fully into the viewport before measuring.
    await canvas.hover();
    const box = (await canvas.boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 80,
      box.y + box.height / 2 + 40,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => (await inner.getAttribute('style')) ?? '', {
        timeout: 3000,
      })
      .toMatch(/translate\(([-\d.]+)px/);
  });

  test('double-click and the reset button restore the fit view', async ({
    page,
  }) => {
    const canvas = await mermaidCanvas(page);
    const inner = canvas.locator('.ap-mermaid__inner');
    const identity = async (): Promise<boolean> =>
      isIdentity((await inner.getAttribute('style')) ?? '');

    await canvas.hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -240);
    await page.keyboard.up('Control');
    await expect.poll(identity, { timeout: 3000 }).toBe(false);

    await canvas.dblclick();
    await expect.poll(identity, { timeout: 3000 }).toBe(true);

    // Zoom in again, then the corner button resets too.
    await canvas.hover();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -240);
    await page.keyboard.up('Control');
    await expect.poll(identity, { timeout: 3000 }).toBe(false);
    await page.locator('.ap-mermaid__reset').first().click();
    await expect.poll(identity, { timeout: 3000 }).toBe(true);
  });
});

test.describe('g2plot slider', () => {
  test('options pass through: the line chart carries its native slider', async ({
    page,
  }) => {
    await page.goto(DIAGRAMS);
    const plot = page.locator('.ap-g2plot').first();
    await expect(plot.locator('canvas').first()).toBeVisible({
      timeout: 20_000,
    });
    const slider = await page.evaluate(() => {
      const host = document.querySelector<HTMLDivElement>('.ap-g2plot');
      const live = (host as (HTMLDivElement & { __apPlot?: unknown }) | null)
        ?.__apPlot;
      if (!live) return 'missing plot';
      const options = (
        live as { options?: { slider?: unknown; data?: unknown[] } }
      ).options;
      if (!options) return 'missing options';
      return options.slider ?? 'missing slider';
    });
    expect(slider).toEqual({ start: 0, end: 1 });
  });
});
