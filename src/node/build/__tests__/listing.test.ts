import { describe, expect, it } from 'vitest';

import type { ArticleInfo, ProfileChip } from '../../../shared/types.ts';
import { resolveConfig } from '../../config.ts';
import {
  listingPages,
  listingRouteOf,
  renderListingContent,
  type ListingPage,
} from '../listing.ts';

const LOCALE = {
  key: '',
  lang: 'zh-CN',
  label: '简体中文',
  prefix: '',
};

function article(route: string, createdAt: string | null): ArticleInfo {
  return {
    route,
    title: route,
    createdAt,
    updatedAt: null,
    category: [],
    tag: [],
  };
}

function chip(name: string, count: number): ProfileChip {
  return { name, count, route: `/tag/${name}` };
}

function listingOf(kind: ListingPage['kind'], locale = LOCALE): ListingPage {
  const suffix = kind;
  return {
    route: `${locale.prefix}/${suffix}/`,
    title: kind,
    locale,
    kind,
  };
}

describe('listingRouteOf', () => {
  it('follows the directoryIndex shape', () => {
    expect(listingRouteOf('', 'timeline', 'slash')).toBe('/timeline/');
    expect(listingRouteOf('', 'timeline', 'bare')).toBe('/timeline');
    expect(listingRouteOf('/en', 'tags', 'slash')).toBe('/en/tags/');
  });
});

describe('listingPages', () => {
  it('emits every kind per locale by default', () => {
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 'S',
        description: 'd',
        hostname: 'https://t.example.com',
        locales: { en: { lang: 'en', label: 'EN' } },
      },
      '/root',
    );
    const pages = listingPages(config);
    expect(pages.map(p => `${p.locale.key}:${p.kind}`)).toEqual([
      'root:timeline',
      'root:categories',
      'root:tags',
      'en:timeline',
      'en:categories',
      'en:tags',
    ]);
    expect(pages[0]?.title).toBe('时间轴');
    expect(pages[3]?.title).toBe('Timeline');
  });

  it('drops disabled kinds', () => {
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 'S',
        description: 'd',
        hostname: 'https://t.example.com',
        pages: { timeline: false, categories: false, tags: false },
      },
      '/root',
    );
    expect(listingPages(config)).toEqual([]);
  });
});

describe('renderListingContent', () => {
  it('renders the h1 plus year-grouped rows, undated last', () => {
    const html = renderListingContent(
      listingOf('timeline'),
      {
        // buildArticles order: createdAt desc, null last.
        articles: [
          article('/a', '2026-10-10'),
          article('/c', '2026-03-05'),
          article('/b', '2025-01-02'),
          article('/d', null),
        ],
        categoryChips: [],
        tagChips: [],
      },
      '../',
    );
    expect(html).toContain('<h1>timeline</h1>');
    // Sorted input (desc, null last) folds into adjacent year groups.
    const years = [...html.matchAll(/ap-timeline__year">([^<]+)</g)].map(
      m => m[1],
    );
    expect(years).toEqual(['2026', '2025', '未注明日期']);
    expect(html).toContain('href="../a"');
    expect(html).toContain(
      '<time class="ap-timeline__date" datetime="2026-10-10">2026-10-10</time>',
    );
    // Undated rows render a dash, no datetime attribute.
    expect(html).toContain('<span class="ap-timeline__date">—</span>');
  });

  it('renders the terms cloud with counts and the base-prefixed archive href', () => {
    const html = renderListingContent(
      listingOf('tags'),
      {
        articles: [],
        categoryChips: [],
        tagChips: [chip('Rust', 3), chip('linux', 1)],
      },
      '../',
    );
    expect(html).toContain('<h1>tags</h1>');
    expect(html).toContain('href="../tag/Rust"');
    expect(html).toContain('<span class="ap-terms__count">3</span>');
  });

  it('renders the shared empty copy when there is nothing to list', () => {
    const empty = renderListingContent(
      listingOf('timeline'),
      { articles: [], categoryChips: [], tagChips: [] },
      '',
    );
    expect(empty).toContain('ap-listing-empty');
    expect(empty).toContain('暂无文章');

    const noTags = renderListingContent(
      listingOf('tags'),
      { articles: [], categoryChips: [chip('x', 1)], tagChips: [] },
      '',
    );
    expect(noTags).toContain('ap-listing-empty');
  });
});
