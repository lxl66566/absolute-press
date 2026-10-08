import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from 'playwright/test';

/** Debug screenshots land in the OS temp dir (manual inspection only). */
const shot = (name: string): string =>
  join(tmpdir(), `code-fold-${name}-zh.png`);

/**
 * Code block features (src/client/styles/code.css + markdown pipeline):
 * line-number gutter, default collapse over 15 lines with a no-JS expander,
 * soft wrap by default and `:wrap=false` per-block horizontal scrolling.
 * Targets the docs site, which exercises every variant on /guide/markdown.
 */

const DOCS = 'http://127.0.0.1:4173';
const PAGE = '/guide/markdown';

async function gotoMarkdown(page: Page): Promise<void> {
  await page.goto(`${DOCS}${PAGE}`);
  await expect(page.locator('.ap-code--ln').first()).toBeVisible();
}

test('line numbers render in the gutter via CSS counters', async ({ page }) => {
  await gotoMarkdown(page);
  const firstLine = page.locator('.ap-code--ln .line').first();
  const marker = await firstLine.evaluate((el: HTMLElement) => {
    const style = getComputedStyle(el, '::before');
    return {
      content: style.content,
      position: style.position,
      width: style.width,
      userSelect: style.userSelect,
    };
  });
  // Chromium reports the unresolved counter() expression; a resolved string
  // would be `"1"`. Position + fixed gutter width prove the layout applies.
  expect(marker.content).toBe('counter(ap-line)');
  expect(marker.position).toBe('absolute');
  expect(parseInt(marker.width, 10)).toBeGreaterThan(0);
  expect(marker.userSelect).toBe('none');
});

test('blocks over 15 lines are collapsed and expand without JS', async ({
  page,
}) => {
  await gotoMarkdown(page);
  // The 18-line demo block on the page (bare :collapsed-lines flag).
  const folded = page.locator(
    '.ap-code--fold.is-collapsed[style*="counter-reset:ap-lines 18"]',
  );
  await expect(folded).toHaveCount(1);

  const hidden = folded.locator('.line.ap-collapsible');
  await expect(hidden).toHaveCount(3);
  // display:none on hidden lines (contrast with the expanded state below).
  const visibilityOf = async (): Promise<boolean[]> =>
    Promise.all(
      (await hidden.all()).map(line =>
        line.isVisible().then(visible => visible),
      ),
    );
  expect(await visibilityOf()).toEqual([false, false, false]);

  const label = folded.locator('.ap-code__fold-toggle');
  const before = await label.evaluate((el: HTMLElement) => {
    const pre = el.parentElement?.querySelector('pre');
    return {
      content: getComputedStyle(el, '::before').content,
      display: getComputedStyle(el).display,
      preMask: pre ? getComputedStyle(pre).maskImage : null,
    };
  });
  // The zh copy rides on :lang(zh) + counter(ap-lines); computed style
  // keeps the counter unresolved but resolves the localized strings.
  expect(before.content).toContain('展开（');
  expect(before.content).toContain('counter(ap-lines)');
  expect(before.display).toBe('flex');
  expect(before.preMask).toContain('linear-gradient');

  await label.click();
  await expect.poll(visibilityOf).toEqual([true, true, true]);
  const after = await label.evaluate((el: HTMLElement) => {
    const pre = el.parentElement?.querySelector('pre');
    return {
      content: getComputedStyle(el, '::before').content,
      preMask: pre ? getComputedStyle(pre).maskImage : null,
    };
  });
  expect(after.content).toContain('收起（');
  expect(after.preMask).toBe('none');

  // Visual evidence of the localized expander copy (collapsed vs expanded).
  await page.reload();
  const block = page.locator(
    '.ap-code--fold.is-collapsed[style*="counter-reset:ap-lines 18"]',
  );
  await block.scrollIntoViewIfNeeded();
  await block.screenshot({ path: shot('collapsed') });
  await block.locator('.ap-code__fold-toggle').click();
  await block.screenshot({ path: shot('expanded') });
});

test('wrap is the default: long lines fold into the container', async ({
  page,
}) => {
  await gotoMarkdown(page);
  const wrapped = page.locator('.ap-code:not(.ap-code--nowrap) pre').first();
  await expect(wrapped).toBeVisible();
  const scroll = await wrapped.evaluate(
    (el: HTMLElement) => el.scrollWidth - el.clientWidth,
  );
  // No horizontal overflow beyond subpixel rounding.
  expect(scroll).toBeLessThanOrEqual(1);
});

test(':wrap=false restores the horizontal scrollbar', async ({ page }) => {
  await gotoMarkdown(page);
  const nowrap = page.locator('.ap-code--nowrap');
  await expect(nowrap).toHaveCount(1);
  const scroll = await nowrap.locator('pre').evaluate((el: HTMLElement) => {
    const style = getComputedStyle(el);
    return {
      overflowX: style.overflowX,
      delta: el.scrollWidth - el.clientWidth,
    };
  });
  expect(scroll.overflowX).toBe('auto');
  // The demo line is a single ~170-char token: wider than any container.
  expect(scroll.delta).toBeGreaterThan(200);
});

test('fold structure does not overflow on mobile (375px)', async ({ page }) => {
  page.setViewportSize({ width: 375, height: 667 });
  await gotoMarkdown(page);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  // The nowrap block still scrolls inside its own pre, not the page.
  const delta = await page
    .locator('.ap-code--nowrap pre')
    .evaluate((el: HTMLElement) => el.scrollWidth - el.clientWidth);
  expect(delta).toBeGreaterThan(200);
});
