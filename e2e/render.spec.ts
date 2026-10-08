import { expect, test, type Page } from 'playwright/test';

/**
 * Markdown rendering regression suite against the docs site (dist/ on
 * 127.0.0.1:4173, see playwright.config.ts). Covers the CSS-consumed DOM
 * contracts that unit tests cannot see: tab header layout, shiki line
 * stacking, and container spacing rhythm — all on guide/markdown,
 * which exercises every pipeline extension.
 */

const PAGE = 'http://127.0.0.1:4173/guide/markdown';

interface TabsGeometry {
  labelTopSpread: number;
  labelBottom: number;
  panelTop: number | null;
  panelTitle: string | null;
}

/** Geometry of the persisted tabs group: label row vs visible panel. */
async function tabsGeometry(page: Page): Promise<TabsGeometry | null> {
  return page.evaluate(() => {
    const group = document.querySelector('.ap-tabs[data-persist]');
    if (!group) return null;
    const labelEls = Array.from(
      group.querySelectorAll<HTMLElement>(':scope > label'),
    );
    const panelEl = Array.from(
      group.querySelectorAll<HTMLElement>(':scope > .ap-tab'),
    ).find(p => getComputedStyle(p).display !== 'none');
    const tops = labelEls.map(l => l.getBoundingClientRect().top);
    return {
      labelTopSpread: Math.max(...tops) - Math.min(...tops),
      labelBottom: Math.max(
        ...labelEls.map(l => l.getBoundingClientRect().bottom),
      ),
      panelTop: panelEl?.getBoundingClientRect().top ?? null,
      panelTitle: panelEl?.getAttribute('data-title') ?? null,
    };
  });
}

test.describe('render: tab header layout', () => {
  test('labels form one header row above the checked panel', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const group = page.locator('.ap-tabs[data-persist]').first();
    await expect(group).toBeVisible();
    const labelCount = await group.locator(':scope > label').count();
    // >= 2 heads: the multi-tab regression (used to strand later labels
    // below the visible panel as plain body text).
    expect(labelCount).toBeGreaterThanOrEqual(3);

    const geo = await tabsGeometry(page);
    expect(geo, 'probe failed').not.toBeNull();
    // Every label in the same row...
    expect(geo?.labelTopSpread).toBeLessThanOrEqual(2);
    // ...and strictly above the visible panel (not inside the body).
    expect(geo?.panelTop).not.toBeNull();
    expect(geo?.labelBottom).toBeLessThanOrEqual((geo?.panelTop ?? 0) + 1);
  });

  test('clicking the third label switches panels in place', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const group = page.locator('.ap-tabs[data-persist]').first();
    await group.locator(':scope > label', { hasText: '第三项' }).click();
    const panel3 = group.locator(':scope > .ap-tab[data-title="第三项"]');
    await expect(panel3).toBeVisible();
    await expect(
      group.locator(':scope > .ap-tab[data-title="第二项"]'),
    ).toBeHidden();
    // The label stays in the header row after switching (not inside the body).
    const labelTop = await group
      .locator(':scope > label', { hasText: '第三项' })
      .evaluate(el => el.getBoundingClientRect().top);
    const panelTop = await panel3.evaluate(
      el => el.getBoundingClientRect().top,
    );
    expect(labelTop).toBeLessThan(panelTop);
  });
});

interface CodeProbe {
  lineCount: number;
  heightSpread: number;
  maxGap: number;
  highlighted: { visible: boolean; text: string }[];
}

test.describe('render: code block lines', () => {
  test('lines stack tightly and highlighted lines keep their content', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const block = page.locator('.ap-code[data-title="src/counter.ts"]').first();
    await expect(block).toBeVisible();

    const probe: CodeProbe | null = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>(
        '.ap-code[data-title="src/counter.ts"]',
      );
      if (!box) return null;
      const lineEls = Array.from(box.querySelectorAll<HTMLElement>('.line'));
      const rects = lineEls.map(l => l.getBoundingClientRect());
      const gaps: number[] = [];
      for (let i = 1; i < rects.length; i++) {
        const prev = rects[i - 1];
        const curr = rects[i];
        if (prev && curr) gaps.push(curr.top - prev.bottom);
      }
      const highlightedEls = Array.from(
        box.querySelectorAll<HTMLElement>('.line.highlighted'),
      );
      return {
        lineCount: lineEls.length,
        heightSpread:
          Math.max(...rects.map(r => r.height)) -
          Math.min(...rects.map(r => r.height)),
        maxGap: gaps.length > 0 ? Math.max(...gaps) : 0,
        highlighted: highlightedEls.map(h => ({
          visible: h.getBoundingClientRect().height > 0,
          text: (h.textContent ?? '').trim(),
        })),
      };
    });
    expect(probe, 'probe failed').not.toBeNull();
    // Source fence has 9 lines; doubled spacing used to insert a blank line
    // between every pair.
    expect(probe?.lineCount).toBe(9);
    expect(probe?.heightSpread).toBeLessThanOrEqual(2);
    expect(probe?.maxGap).toBeLessThanOrEqual(2);
    // Highlighted rows {1,3-4}: visible and non-empty (content used to look
    // blank behind the doubled spacing).
    expect(probe?.highlighted).toHaveLength(3);
    for (const line of probe?.highlighted ?? []) {
      expect(line.visible).toBe(true);
      expect(line.text.length).toBeGreaterThan(0);
    }
  });

  test('highlighted lines paint the accent bar in both themes', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const assertPaint = async (theme: 'light' | 'dark'): Promise<void> => {
      await page.evaluate(t => {
        localStorage.setItem('ap-theme', t);
        document.documentElement.dataset.theme = t;
      }, theme);
      const paint = await page.evaluate(() => {
        const line = document.querySelector<HTMLElement>(
          '.ap-code[data-title="src/counter.ts"] .line.highlighted',
        );
        if (!line) return null;
        const cs = getComputedStyle(line);
        return { shadow: cs.boxShadow };
      });
      expect(paint, `no highlighted line in ${theme}`).not.toBeNull();
      // The inset accent bar (background-color is a color-mix whose computed
      // value Chromium serializes as transparent, so assert the bar instead).
      expect(paint?.shadow).toContain('inset');
      expect(paint?.shadow).not.toBe('none');
    };
    await assertPaint('light');
    await assertPaint('dark');
  });
});

test.describe('render: container rhythm', () => {
  test('containers keep compact padding and gaps to the next block', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const probe = await page.evaluate(() => {
      const first = document.querySelector<HTMLElement>(
        '#ap-content > .ap-container',
      );
      if (!first) return null;
      // Container demos on this page are interleaved with their markdown
      // source blocks, so the collapsed margin to the next sibling block is
      // what used to be measured container-to-container when stacked.
      const next = first.nextElementSibling as Element | null;
      const cs = getComputedStyle(first);
      const title = first.querySelector('.ap-container__title');
      const body = first.querySelector('p:not(.ap-container__title)');
      return {
        paddingY: cs.paddingTop,
        blockGap: next
          ? next.getBoundingClientRect().top -
            first.getBoundingClientRect().bottom
          : 0,
        titleMarginBottom: title ? getComputedStyle(title).marginBottom : null,
        titleFontSize: title ? getComputedStyle(title).fontSize : null,
        bodyFontSize: body ? getComputedStyle(body).fontSize : null,
      };
    });
    expect(probe, 'probe failed').not.toBeNull();
    // Compact container standard: 10-14px padding, <=16px to the next
    // block, 4-6px title-to-body gap.
    expect(parseFloat(probe?.paddingY ?? '0')).toBeLessThanOrEqual(14);
    expect(probe?.blockGap).toBeLessThanOrEqual(16);
    expect(parseFloat(probe?.titleMarginBottom ?? '0')).toBeLessThanOrEqual(6);
    // Title reads through weight + color only: same font size as the body.
    expect(probe?.titleFontSize).toBe(probe?.bodyFontSize);
  });
});

test.describe('render: theme toggle icon', () => {
  test('icon mirrors the current theme, label describes the action', async ({
    page,
  }) => {
    await page.goto(PAGE);
    const toggle = page.locator('header button[aria-label^="切换到"]');
    // Light mode shows the sun (circle + rays); moon has a single path.
    await expect(toggle.locator('svg circle')).toHaveCount(1);
    await expect(toggle).toHaveAttribute('aria-label', '切换到暗色模式');
    await toggle.click();
    // Dark mode flips to the moon; the label keeps describing the action.
    await expect(toggle).toHaveAttribute('aria-label', '切换到亮色模式');
    await expect(toggle.locator('svg circle')).toHaveCount(0);
  });
});
