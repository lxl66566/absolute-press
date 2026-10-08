import { describe, expect, it } from 'vitest';

import { parseArchiveRoute, seoPageType } from '../seo.ts';
import type { PagePayload } from '../types.ts';

function payload(route: string, localeKey = 'root'): PagePayload {
  return {
    site: {
      title: 'S',
      description: 'd',
      base: '',
      locales: [
        { key: 'root', lang: 'zh-CN', label: 'zh', prefix: '' },
        { key: 'en', lang: 'en', label: 'en', prefix: '/en' },
      ],
      locale: localeKey,
    },
    navbar: [],
    sidebar: [],
    page: {
      route,
      locale: localeKey,
      title: 'T',
      headings: [],
      frontmatter: {},
      createdAt: null,
      updatedAt: null,
    },
  };
}

describe('seoPageType', () => {
  it('marks the default-locale home as website', () => {
    expect(seoPageType(payload('/'))).toBe('website');
  });

  it('marks a locale home as website via the locale prefix', () => {
    expect(seoPageType(payload('/en/', 'en'))).toBe('website');
  });

  it('marks category/tag archive routes as website', () => {
    expect(seoPageType(payload('/category/news'))).toBe('website');
    expect(seoPageType(payload('/en/tag/alpha', 'en'))).toBe('website');
  });

  it('marks every other page as article', () => {
    expect(seoPageType(payload('/guide/a'))).toBe('article');
    expect(seoPageType(payload('/en/guide/a', 'en'))).toBe('article');
    expect(seoPageType(payload('/guide/', 'root'))).toBe('article');
    // An article that merely lives under a category-named directory is not
    // an archive: only the exact `<prefix>/<kind>/<name>` shape counts.
    expect(seoPageType(payload('/category/news/extra'))).toBe('article');
  });
});

describe('parseArchiveRoute', () => {
  it('parses locale-prefixed archive routes and decodes the name', () => {
    expect(parseArchiveRoute('/category/foo')).toEqual({
      kind: 'category',
      name: 'foo',
    });
    expect(parseArchiveRoute('/en/tag/%E5%B7%A5%E5%85%B7')).toEqual({
      kind: 'tag',
      name: '工具',
    });
  });

  it('rejects non-archive routes', () => {
    expect(parseArchiveRoute('/coding/foo')).toBeNull();
    expect(parseArchiveRoute('/category/foo/bar')).toBeNull();
    expect(parseArchiveRoute('/')).toBeNull();
    expect(parseArchiveRoute('/category/foo/')).toBeNull();
  });
});
