import { expect, test, type Page } from 'playwright/test';

/**
 * Docs-site smoke suite against dist/ (webServer on 127.0.0.1:4173, see
 * playwright.config.ts). Chrome mounts into the four shell slots
 * (#ap-nav / #ap-sidebar / #ap-toc / #ap-content), islands hydrate
 * `[data-ap-island]`, theme lives on html[data-theme] + localStorage
 * `ap-theme`. The site config registers the Counter island and one encrypt
 * rule (/guide/secret.html with `docs-demo`, see vite.config.ts).
 */

const ORIGIN = 'http://localhost:4173';
const DOCS = `${ORIGIN}`;

/** Every built docs page: content pages plus generated tag/category archives. */
const ALL_PAGES = [
  '/index.html',
  '/guide/index.html',
  '/guide/getting-started.html',
  '/guide/configuration.html',
  '/guide/markdown.html',
  '/guide/islands.html',
  '/guide/theme.html',
  '/guide/i18n.html',
  '/guide/encrypt.html',
  '/guide/secret.html',
  '/guide/migration.html',
  '/guide/deploy.html',
  '/guide/writing.html',
  '/guide/search-comments.html',
  '/guide/seo.html',
  '/guide/faq.html',
  '/guide/advanced/deep.html',
  '/design/index.html',
  '/design/why.html',
  '/design/architecture.html',
  '/design/build-pipeline.html',
  '/design/islands-runtime.html',
  '/en/index.html',
  '/en/guide/index.html',
  '/en/guide/getting-started.html',
  '/en/guide/configuration.html',
  '/en/guide/markdown.html',
  '/en/guide/islands.html',
  '/en/guide/theme.html',
  '/en/guide/i18n.html',
  '/en/guide/encrypt.html',
  '/en/guide/secret.html',
  '/en/guide/migration.html',
  '/en/guide/deploy.html',
  '/en/guide/writing.html',
  '/en/guide/search-comments.html',
  '/en/guide/seo.html',
  '/en/guide/faq.html',
  '/en/guide/advanced/deep.html',
  '/en/design/index.html',
  '/en/design/why.html',
  '/en/design/architecture.html',
  '/en/design/build-pipeline.html',
  '/en/design/islands-runtime.html',
  '/en/category/guide.html',
  '/en/category/design.html',
  '/en/tag/getting-started.html',
  '/en/tag/markdown.html',
  '/category/指南.html',
  '/category/设计.html',
  '/tag/css.html',
  '/tag/faq.html',
  '/tag/i18n.html',
  '/tag/islands.html',
  '/tag/markdown.html',
  '/tag/rss.html',
  '/tag/seo.html',
  '/tag/solid.html',
  '/tag/ssg.html',
  '/tag/vuepress.html',
  '/tag/主题.html',
  '/tag/入门.html',
  '/tag/写作.html',
  '/tag/加密.html',
  '/tag/安装.html',
  '/tag/搜索.html',
  '/tag/构建.html',
  '/tag/架构.html',
  '/tag/自测.html',
  '/tag/评论.html',
  '/tag/迁移.html',
  '/tag/部署.html',
  '/tag/配置.html',
];

/** Pages whose lazy islands (mermaid/g2plot) must settle before assertions. */
const SETTLE_PAGES: Record<string, (page: Page) => Promise<void>> = {
  '/guide/islands.html': async page => {
    await expect(page.locator('.ap-mermaid svg').first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator('.ap-g2plot canvas').first()).toBeVisible({
      timeout: 20000,
    });
  },
  // Architecture pages carry one mermaid fence each; wait for the SVG so
  // the lazy chunk load cannot race the no-error assertions below.
  '/design/architecture.html': async page => {
    await expect(page.locator('.ap-mermaid svg').first()).toBeVisible({
      timeout: 20000,
    });
  },
  '/en/design/architecture.html': async page => {
    await expect(page.locator('.ap-mermaid svg').first()).toBeVisible({
      timeout: 20000,
    });
  },
};

/**
 * Third-party origins (giscus / algolia / googletagmanager / github images)
 * are allowed to fail offline; only same-origin breakage counts as a defect.
 */
function isThirdParty(url: string): boolean {
  try {
    return new URL(url).origin !== ORIGIN;
  } catch {
    return false;
  }
}

interface IssueTracker {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

function trackIssues(page: Page): IssueTracker {
  const issues: IssueTracker = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
  };
  page.on('console', msg => {
    if (msg.type() !== 'error' || isThirdParty(msg.location().url)) return;
    issues.consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    issues.pageErrors.push(String(err));
  });
  page.on('requestfailed', req => {
    if (isThirdParty(req.url())) return;
    issues.failedRequests.push(
      `${req.url()}: ${req.failure()?.errorText ?? 'unknown'}`,
    );
  });
  return issues;
}

async function expectNoIssues(
  issues: IssueTracker,
  label: string,
): Promise<void> {
  expect(issues.consoleErrors, `${label}: console errors`).toEqual([]);
  expect(issues.pageErrors, `${label}: page errors`).toEqual([]);
  expect(issues.failedRequests, `${label}: failed requests`).toEqual([]);
}

test.describe('docs: every page loads cleanly', () => {
  for (const path of ALL_PAGES) {
    test(`${path} mounts chrome without errors`, async ({ page }) => {
      const issues = trackIssues(page);
      await page.goto(`${DOCS}${path}`);
      await expect(page.locator('#ap-nav header')).toBeVisible();
      await expect(page.locator('#ap-sidebar')).toBeAttached();
      await expect(page.locator('#ap-toc')).toBeAttached();
      await expect(page.locator('#ap-content')).not.toBeEmpty();
      const settle = SETTLE_PAGES[path];
      if (settle) await settle(page);
      await expectNoIssues(issues, path);
    });
  }

  test('encrypted page shows the gate, not the content', async ({ page }) => {
    await page.goto(`${DOCS}/guide/secret.html`);
    await expect(page.locator('.ap-gate__form')).toBeVisible();
    await expect(page.locator('#ap-content')).not.toContainText('你成功解锁了');
  });

  test('article page mounts nav, sidebar and toc chrome', async ({ page }) => {
    await page.goto(`${DOCS}/guide/getting-started.html`);
    await expect(page.locator('#ap-nav header')).toBeVisible();
    // The aside also carries the mobile-only nav links (lg:hidden); assert
    // the sidebar's own active-page link instead.
    const active = page.locator('#ap-sidebar a[aria-current="page"]');
    await expect(active).toHaveText(/快速开始/);
    expect(await active.isVisible()).toBe(true);
    expect(await page.locator('#ap-sidebar a').count()).toBeGreaterThanOrEqual(
      5,
    );
    const toc = page.locator('#ap-toc nav');
    await expect(toc).toBeVisible();
    expect(await toc.locator('a').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('#ap-content h1')).toContainText('快速开始');
    // At xl the fixed rail carries the outline; the inline card (narrow
    // viewports only) must stay out of the way.
    await expect(page.locator('.ap-toc-inline')).toBeHidden();
  });

  test('archive page mounts the list and drops the fallback title', async ({
    page,
  }) => {
    await page.goto(`${DOCS}/category/指南.html`);
    // Exactly one h1: the interactive ArchiveView title, not the static
    // no-JS fallback that the shell emits.
    await expect(page.locator('#ap-content h1')).toHaveCount(1);
    await expect(page.locator('#ap-content h1')).toContainText('分类：指南');
    await expect(page.locator('#ap-content ul li').first()).toBeVisible();
  });
});

test.describe('docs: theme toggle', () => {
  test('flips html[data-theme], persists across reload', async ({ page }) => {
    await page.goto(`${DOCS}/index.html`);
    await expect(page.locator('#ap-nav header')).toBeVisible();
    const initial = await page.locator('html').getAttribute('data-theme');
    expect(initial === 'light' || initial === 'dark').toBe(true);
    await page.getByRole('button', { name: /切换到(暗色|亮色)模式/ }).click();
    const flipped = initial === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
  });

  test('dark mode renders code blocks without glaring white bg', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('ap-theme', 'dark'));
    await page.goto(`${DOCS}/guide/markdown.html`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.ap-code pre').first()).toBeVisible();
    // Neither the shiki pre nor its .ap-code container may paint near-white
    // in dark mode (pre is transparent; the container uses --c-code-bg).
    const darkPainted = await page.evaluate(() => {
      const pre = document.querySelector('.ap-code pre');
      if (!pre) return false;
      const box = pre.closest('.ap-code');
      for (const el of [pre, box]) {
        if (!el) continue;
        const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(
          getComputedStyle(el).backgroundColor,
        );
        if (!m) continue;
        const alpha = m[4] === undefined ? 1 : Number(m[4]);
        if (
          alpha > 0 &&
          Number(m[1]) > 200 &&
          Number(m[2]) > 200 &&
          Number(m[3]) > 200
        ) {
          return false;
        }
      }
      return true;
    });
    expect(darkPainted).toBe(true);
  });
});

test.describe('docs: chinese anchor toc', () => {
  test('toc link syncs the hash and scrolls to the heading', async ({
    page,
  }) => {
    await page.goto(`${DOCS}/guide/markdown.html`);
    const link = page
      .locator('#ap-toc nav a')
      .filter({ hasText: '数学公式' })
      .first();
    await expect(link).toBeVisible();
    await link.click();
    // Toc navigation pushState's the slug; hash arrives percent-encoded.
    await expect
      .poll(() => page.evaluate(() => decodeURIComponent(location.hash)))
      .toBe('#数学公式');
    // Smooth scroll settles with the heading just below the fixed navbar.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.getElementById('数学公式');
          return el ? Math.round(el.getBoundingClientRect().top) : null;
        }),
      )
      .toBeLessThan(300);
  });

  test('toc clicks flash the target heading', async ({ page }) => {
    await page.goto(`${DOCS}/guide/markdown.html`);
    const link = page
      .locator('#ap-toc nav a')
      .filter({ hasText: '数学公式' })
      .first();
    await link.click();
    await expect(page.locator('#数学公式')).toHaveClass(/ap-anchor-flash/);
  });

  test('anchor target keeps its flash until the user scrolls', async ({
    page,
  }) => {
    // Initial load with a hash flashes the target heading too.
    await page.goto(`${DOCS}/guide/markdown.html#数学公式`);
    const heading = page.locator('#数学公式');
    await expect(heading).toHaveClass(/ap-anchor-flash/);
    // An explicit user scroll intent (wheel) cancels it.
    await page.mouse.wheel(0, 120);
    await expect(heading).not.toHaveClass(/ap-anchor-flash/);
  });
});

test.describe('docs: islands', () => {
  test('mermaid renders svg and g2plot renders canvas', async ({ page }) => {
    const issues = trackIssues(page);
    await page.goto(`${DOCS}/guide/islands.html`);
    await expect(page.locator('.ap-mermaid svg').first()).toBeVisible({
      timeout: 20000,
    });
    expect(
      await page.locator('.ap-mermaid svg').count(),
    ).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.ap-g2plot canvas').first()).toBeVisible({
      timeout: 20000,
    });
    expect(
      await page.locator('.ap-g2plot canvas').count(),
    ).toBeGreaterThanOrEqual(2);
    await expectNoIssues(issues, '/guide/islands.html');
  });

  test('Counter island hydrates and increments on click', async ({ page }) => {
    await page.goto(`${DOCS}/guide/islands.html`);
    const slot = page.locator('[data-ap-island="Counter"]');
    await expect(slot).toBeAttached();
    const button = slot.locator('button.ap-demo-counter');
    await expect(button).toHaveText('点击次数: 5');
    await button.click();
    await expect(button).toHaveText('点击次数: 6');
  });

  test('ZoomedImg opens the shared photoswipe lightbox', async ({ page }) => {
    await page.goto(`${DOCS}/guide/islands.html`);
    // .first(): the page also carries a ZoomedImg nested inside the
    // ExpandableList example below.
    const standalone = page.locator('[data-ap-island="ZoomedImg"]').first();
    await expect(standalone.locator('img')).toBeVisible();
    await standalone.locator('img').click();
    await expect(page.locator('.pswp--open')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('docs: password gate', () => {
  test('wrong password rejected; docs-demo unlocks and is remembered', async ({
    page,
  }) => {
    await page.goto(`${DOCS}/guide/secret.html`);
    const form = page.locator('.ap-gate__form');
    await expect(form).toBeVisible();
    await page.locator('.ap-gate__input').fill('wrong-pass');
    await page.locator('.ap-gate__submit').click();
    await expect(page.locator('.ap-gate__error')).toBeVisible();

    await page.locator('.ap-gate__input').fill('docs-demo');
    await page.locator('.ap-gate__submit').click();
    const content = page.locator('.ap-gate__content');
    await expect(content).toBeVisible();
    await expect(content.locator('h1')).toContainText('加密演示页');
    // Title-first layout survives the gate: the meta row repositions under
    // the body h1 (inside the gate content) once the unlock renders it.
    const metaRow = page.locator('#ap-content .ap-article-meta');
    await expect(metaRow).toBeVisible();
    expect((await content.locator('h1').boundingBox())!.y).toBeLessThan(
      (await metaRow.boundingBox())!.y,
    );
    await page.reload();
    await expect(page.locator('.ap-gate__content h1')).toBeVisible();
    await expect(page.locator('.ap-gate__form')).toHaveCount(0);
    // Remembered unlock rebuilds the body on mount — same ordering there.
    await expect(metaRow).toBeVisible();
    expect((await content.locator('h1').boundingBox())!.y).toBeLessThan(
      (await metaRow.boundingBox())!.y,
    );
  });
});

test.describe('docs: i18n', () => {
  test('en pages set lang="en"', async ({ page }) => {
    await page.goto(`${DOCS}/en/index.html`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // Default locale stays Chinese.
    await page.goto(`${DOCS}/index.html`);
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).not.toBe('en');
  });

  test('cross-locale link reaches the default locale', async ({ page }) => {
    // The en markdown showcase keeps one deliberate cross-locale demo link.
    await page.goto(`${DOCS}/en/guide/markdown.html`);
    await page
      .locator('#ap-content a', { hasText: 'Chinese page' })
      .first()
      .click();
    await expect(page).toHaveURL(/\/guide\/getting-started\.html$/);
    await expect(page.locator('#ap-content h1')).toContainText('快速开始');
  });

  test('en meta chips link to the en archive pages', async ({ page }) => {
    // Archives are grouped per locale: the 'getting-started' tag exists only
    // under /en, so a chip without the locale prefix would 404.
    await page.goto(`${DOCS}/en/guide/getting-started.html`);
    const meta = page.locator('#ap-content .ap-article-meta');
    // href is page-relative ('../en/tag/...' resolved against the page).
    await expect(meta.locator('a', { hasText: 'guide' })).toHaveAttribute(
      'href',
      /en\/category\/guide\.html$/,
    );
    const chip = meta.locator('a', { hasText: 'getting-started' });
    await expect(chip).toHaveAttribute(
      'href',
      /en\/tag\/getting-started\.html$/,
    );
    await chip.click();
    await expect(page).toHaveURL(/\/en\/tag\/getting-started\.html$/);
    await expect(page.locator('#ap-content h1')).toContainText(
      'getting-started',
    );
    await expect(page.locator('#ap-content ul li').first()).toBeVisible();
  });

  test('locale switcher soft-navigates and remounts nav + sidebar', async ({
    page,
  }) => {
    // The switcher's prefix-swap href only resolves for mirrored routes:
    // run on the home pages, whose counterparts exist on both sides.
    await page.goto(`${DOCS}/index.html`);
    // Pin the client-side path: a full reload would silently rebuild the
    // chrome and mask the regression this guards (persistent chrome keeping
    // the previous locale's trees).
    await page.evaluate(() => {
      (window as { apE2eMarker?: number }).apE2eMarker = 42;
    });

    const dropLinks = (text: string) =>
      page.locator('#ap-nav ul.ap-nav-drop a:visible', { hasText: text });
    await page.locator('#ap-nav button[aria-label="切换语言"]').click();
    await dropLinks('English').first().click();
    await expect(page).toHaveURL(/\/en\/index\.html$/);
    // Same document — the router swapped the page, nothing reloaded.
    expect(
      await page.evaluate(
        () => (window as { apE2eMarker?: number }).apE2eMarker,
      ),
    ).toBe(42);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    // Both persistent chrome roots must show the en trees and copy.
    await expect(page.locator('#ap-nav')).toContainText('Getting started');
    await expect(page.locator('#ap-sidebar')).toContainText('Getting started');
    await expect(page.locator('#ap-nav')).not.toContainText('指南');
    await expect(
      page.locator('#ap-nav button[aria-label="Change language"]'),
    ).toBeAttached();

    // And back to the default locale through the same control.
    await page.locator('#ap-nav button[aria-label="Change language"]').click();
    await dropLinks('简体中文').first().click();
    await expect(page).toHaveURL(/\/index\.html$/);
    expect(
      await page.evaluate(
        () => (window as { apE2eMarker?: number }).apE2eMarker,
      ),
    ).toBe(42);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('#ap-nav')).toContainText('指南');
    await expect(page.locator('#ap-sidebar')).toContainText('指南');
    await expect(page.locator('#ap-nav')).not.toContainText('Getting started');
  });
});

test.describe('docs: URL contract', () => {
  test('in-site navigation keeps .html suffix URLs', async ({ page }) => {
    await page.goto(`${DOCS}/index.html`);
    await page
      .locator('#ap-content a[href="guide/configuration.html"]')
      .first()
      .click();
    await expect(page).toHaveURL(/guide\/configuration\.html$/);
    await expect(page.locator('#ap-content h1')).toContainText('配置参考');
  });
});

/** Content pages carry no cross-page #links; plant a fixed-position one so
 * the router's click path runs exactly as for authored links. */
async function plantLink(page: Page, href: string): Promise<void> {
  await page.evaluate(target => {
    const a = document.createElement('a');
    a.textContent = 'ap-e2e-link';
    a.setAttribute('href', target);
    // Fixed center: plain flow would sit under the fixed chrome slots.
    a.style.position = 'fixed';
    a.style.top = '50%';
    a.style.left = '50%';
    document.body.appendChild(a);
  }, href);
}

test.describe('docs: soft router scroll', () => {
  test('soft navigation to a cross-page hash lands on the anchor', async ({
    page,
  }) => {
    await page.goto(`${DOCS}/guide/getting-started.html`);
    await page.evaluate(() => {
      (window as { apE2eMarker?: number }).apE2eMarker = 42;
    });
    await plantLink(page, '/guide/markdown.html#数学公式');
    await page.locator('a', { hasText: 'ap-e2e-link' }).click();
    // Soft navigation: the router swapped the page, nothing reloaded.
    await expect
      .poll(() =>
        page.evaluate(
          () => `${location.pathname}${decodeURIComponent(location.hash)}`,
        ),
      )
      .toBe('/guide/markdown.html#数学公式');
    expect(
      await page.evaluate(
        () => (window as { apE2eMarker?: number }).apE2eMarker,
      ),
    ).toBe(42);
    // Landed on the anchor (scroll-margin-top offsets the fixed navbar),
    // not the page top, and the target heading flashes like a native jump.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.getElementById('数学公式');
          return el ? Math.round(el.getBoundingClientRect().top) : null;
        }),
      )
      .toBeLessThan(300);
    await expect(page.locator('#数学公式')).toHaveClass(/ap-anchor-flash/);
  });

  test('going back restores the scroll the left page was left at', async ({
    page,
  }) => {
    await page.goto(`${DOCS}/guide/getting-started.html`);
    await page.evaluate(() => window.scrollTo(0, 800));
    // The offset actually reached (clamped if the page is shorter); the
    // restoration must land exactly here, not one entry off.
    const left = await page.evaluate(() => window.scrollY);
    expect(left).toBeGreaterThan(400);
    await plantLink(page, '/guide/markdown.html');
    await page.locator('a', { hasText: 'ap-e2e-link' }).click();
    // Swap done: the fresh page starts at the top.
    await expect(page.locator('#数学公式')).toBeAttached();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.goBack();
    // Swap back done once the target page's anchor disappears, then the
    // offset saved on the entry being returned to must be restored.
    await expect(page.locator('#数学公式')).not.toBeAttached();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(left);
  });
});

test.describe('docs: footnote title isolation (regression)', () => {
  test('markdown page has exactly one footnote block, titles stay clean', async ({
    page,
  }) => {
    await page.goto(`${DOCS}/guide/markdown.html`);
    await expect(page.locator('section.footnotes')).toHaveCount(1);
    // No leaked footnote markup inside container titles / summaries / tabs.
    await expect(
      page.locator(
        '.ap-container section.footnotes, summary section.footnotes, .ap-tabs section.footnotes',
      ),
    ).toHaveCount(0);
    await expect(
      page.locator('p.ap-container__title hr, summary hr, label hr'),
    ).toHaveCount(0);
    const summary = page.locator('summary.ap-container__title').first();
    await expect(summary).toHaveText('点我展开');
  });
});

test.describe('docs: mobile viewport (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('no horizontal overflow and drawer menu works', async ({ page }) => {
    await page.goto(`${DOCS}/guide/getting-started.html`);
    await expect(page.locator('#ap-nav header')).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: '打开菜单' }).click();
    // The drawer is its own fixed panel next to the navbar header.
    const drawer = page.locator('#ap-nav .ap-drawer-panel');
    await expect(drawer).toHaveClass(/ap-open/);
    await expect(page.locator('.ap-drawer-backdrop')).toBeVisible();
    // Backdrop click closes (the burger toggles too; there is deliberately
    // no Escape handler for the drawer). Click near the right edge: the open
    // panel (min(--ap-sidebar-w, 85vw) ≈ 319px here) always covers the
    // viewport center, so a center click lands on the panel's links, and a
    // center click that succeeds only ever won the slide-in race.
    await page
      .locator('.ap-drawer-backdrop')
      .click({ position: { x: 360, y: 333 } });
    await expect(drawer).not.toHaveClass(/ap-open/);
  });

  test('inline toc sits below the meta row, collapsed until toggled', async ({
    page,
  }) => {
    await page.goto(`${DOCS}/guide/getting-started.html`);
    const card = page.locator('.ap-toc-inline');
    await expect(card).toBeVisible();
    // Placement contract: below the article meta row (the date line).
    const meta = page.locator('#ap-content .ap-article-meta');
    expect((await card.boundingBox())!.y).toBeGreaterThan(
      (await meta.boundingBox())!.y,
    );
    // Collapsed by default: rows are attached behind the toggle but not
    // rendered open.
    const toggle = card.locator('button.ap-toc-inline__toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(card.locator('a').first()).not.toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(card.locator('a').first()).toBeVisible();
  });

  test('inline toc link navigates like the rail', async ({ page }) => {
    await page.goto(`${DOCS}/guide/getting-started.html`);
    await page.locator('.ap-toc-inline button.ap-toc-inline__toggle').click();
    // Wait for the expansion to settle before tapping an entry: a click
    // during the 160ms height transition computes its scroll destination
    // against the shorter, still-opening card and lands short.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.getElementById('ap-toc-inline-body');
          return el
            ? Math.abs(el.getBoundingClientRect().height - el.scrollHeight) < 1
            : false;
        }),
      )
      .toBe(true);
    const link = page
      .locator('.ap-toc-inline a')
      .filter({ hasText: '目录结构' })
      .first();
    await link.click();
    // Same navigation contract as the rail: hash sync + smooth scroll that
    // settles with the heading just below the fixed navbar.
    await expect
      .poll(() => page.evaluate(() => decodeURIComponent(location.hash)))
      .toBe('#目录结构');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.getElementById('目录结构');
          return el ? Math.round(el.getBoundingClientRect().top) : null;
        }),
      )
      .toBeLessThan(300);
  });
});
