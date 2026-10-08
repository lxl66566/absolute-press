import { describe, expect, it } from 'vitest';

import type { ArticleInfo } from '../../../shared/types.ts';
import { resolveConfig } from '../../config.ts';
import {
  BUILD_COMPONENT_RENDERERS,
  type BuildComponentContext,
} from '../components.ts';

const config = resolveConfig(
  {
    contentDir: 'content',
    title: 'Site',
    description: 'desc',
    hostname: 'https://test.example.com',
  },
  process.cwd(),
);

function ctx(
  articles: ArticleInfo[],
  extra: Partial<BuildComponentContext> = {},
): BuildComponentContext {
  return {
    config,
    // buildArticles contract: locale homes excluded, createdAt descending.
    articles,
    base: '',
    icons: {},
    lang: undefined,
    route: '/',
    filePath: '/content/index.md',
    ...extra,
  };
}

function art(route: string, over: Partial<ArticleInfo> = {}): ArticleInfo {
  return {
    route,
    title: `T ${route}`,
    createdAt: '2026-01-01',
    updatedAt: null,
    category: [],
    tag: [],
    ...over,
  };
}

const render = (
  props: Record<string, unknown>,
  c: BuildComponentContext,
): string => BUILD_COMPONENT_RENDERERS['RecentArticles']!(props, c);

describe('RecentArticles build component', () => {
  it('renders both columns with locale-resolved headings', () => {
    const html = render({}, ctx([art('/a', { updatedAt: '2026-02-01' })]));
    expect(html).toContain('<section class="ap-recent">');
    expect(html).toContain('最新文章');
    expect(html).toContain('最近更新');
    expect(
      render(
        {},
        ctx([art('/a', { updatedAt: '2026-02-01' })], { lang: 'en-US' }),
      ),
    ).toContain('Latest articles');
  });

  it('slices the latest column to the count (default 5)', () => {
    // buildArticles contract: input list is createdAt-descending.
    const articles = Array.from({ length: 8 }, (_, i) =>
      art(`/a${i}`, { createdAt: `2026-01-0${i + 1}` }),
    ).toReversed();
    const html = render({}, ctx(articles));
    expect(html).toContain('href="a7"');
    expect(html).toContain('href="a3"');
    expect(html).not.toContain('href="a2"');
    expect(render({ latest: 2 }, ctx(articles))).not.toContain('href="a5"');
  });

  it('omits the updated column when no page was separately committed', () => {
    const html = render({}, ctx([art('/a', { updatedAt: '2026-01-01' })]));
    expect(html).toContain('最新文章');
    expect(html).not.toContain('最近更新');
  });

  it('orders the updated column by git time, skipping never-updated pages', () => {
    const articles = [
      art('/new', { createdAt: '2026-03-01', updatedAt: '2026-03-01' }),
      art('/fresh', { createdAt: '2026-02-01', updatedAt: null }),
      art('/old1', { createdAt: '2026-01-01', updatedAt: '2026-03-05' }),
      art('/old2', { createdAt: '2025-12-01', updatedAt: '2026-03-07' }),
    ];
    const html = render({ latest: 0, updated: 2 }, ctx(articles));
    // Newest git time first; equal times fall back to route order.
    const i1 = html.indexOf('old2');
    const i2 = html.indexOf('old1');
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(html).not.toContain('href="new"');
    expect(html).not.toContain('fresh');
    expect(html).not.toContain('最新文章');
  });

  it('renders nothing for a zero/zero or article-less site', () => {
    expect(render({ latest: 0, updated: 0 }, ctx([art('/a')]))).toBe('');
    expect(render({}, ctx([]))).toBe('');
  });

  it('fails on non-natural-number counts, naming the source file', () => {
    for (const bad of [-1, 1.5, '5']) {
      expect(() => render({ latest: bad }, ctx([art('/a')]))).toThrow(
        /RecentArticles.*latest.*\/content\/index\.md/,
      );
    }
  });

  it('prefixes hrefs with the page base and keeps md-link href shapes', () => {
    const nested = render(
      {},
      ctx([art('/guide/a')], { base: '../', route: '/guide/' }),
    );
    expect(nested).toContain('href="../guide/a"');
    expect(render({}, ctx([art('/a')], { base: '' }))).toContain('href="a"');
  });

  it('wraps bare icon markup, passes svg through, drops unknown keys', () => {
    const articles = [
      art('/bare', { icon: 'i-bare' }),
      art('/full', { icon: 'i-full' }),
      art('/gone', { icon: 'i-gone' }),
    ];
    const html = render(
      { latest: 3, updated: 0 },
      ctx(articles, {
        icons: {
          'i-bare': '  <path d="M0 0"/> ',
          'i-full': '<svg viewBox="0 0 16 16"><path d="M1 1"/></svg>',
        },
      }),
    );
    expect(html).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0"/></svg>',
    );
    expect(html).toContain('<svg viewBox="0 0 16 16">');
    // Three rows but only two icons: the unregistered key renders none.
    expect(html.match(/<li class="ap-recent__item">/g)).toHaveLength(3);
    expect(html.match(/<svg/g)).toHaveLength(2);
  });

  it('escapes titles and dates land in a machine-readable attribute', () => {
    const html = render(
      {},
      ctx([
        art('/a', { title: '<b>x&y</b>', createdAt: '2026-01-02T08:00:00Z' }),
      ]),
    );
    expect(html).toContain('&lt;b&gt;x&amp;y&lt;/b&gt;');
    expect(html).toMatch(
      /<time class="ap-recent__date" datetime="[^"]*">2026-01-02<\/time>/,
    );
  });
});
