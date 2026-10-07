import { describe, expect, it } from 'vitest';

import type { PagePayload } from '../../../shared/types';
import { formatDate } from '../date';
import {
  archiveHref,
  isActiveRoute,
  isExternalHref,
  localePrefixOf,
  parseArchiveRoute,
  stripLocalePrefix,
  withBase,
} from '../links';

/** Payload site block with the docs locales, pinned to one locale key. */
const siteWithLocale = (locale: string): PagePayload['site'] => ({
  title: 't',
  description: 'd',
  base: '',
  locale,
  locales: [
    { key: 'zh', lang: 'zh-CN', label: '简体中文', prefix: '' },
    { key: 'en', lang: 'en', label: 'English', prefix: '/en' },
  ],
});

describe('formatDate', () => {
  it('formats as yyyy-MM-dd', () => {
    expect(formatDate('2024-03-05')).toBe('2024-03-05');
    expect(formatDate('2024-03-05T10:20:30.000Z')).toMatch(/^2024-03-0[456]$/);
  });

  it('returns null for missing or invalid input', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate('')).toBeNull();
    expect(formatDate('not-a-date')).toBeNull();
  });
});

describe('withBase', () => {
  it('joins relative base prefixes with routes', () => {
    expect(withBase('', '/a/b.html')).toBe('a/b.html');
    expect(withBase('../', '/a/b.html')).toBe('../a/b.html');
    expect(withBase('../../', '/index.html')).toBe('../../index.html');
  });
});

describe('isExternalHref', () => {
  it('treats absolute and protocol-relative URLs as external', () => {
    expect(isExternalHref('https://example.com/a')).toBe(true);
    expect(isExternalHref('http://example.com')).toBe(true);
    expect(isExternalHref('//example.com/a')).toBe(true);
    expect(isExternalHref('HTTPS://EXAMPLE.COM/a')).toBe(true);
  });

  it('recognizes opaque schemes mailto: and tel:', () => {
    expect(isExternalHref('mailto:user@example.com')).toBe(true);
    expect(isExternalHref('tel:+8613800000000')).toBe(true);
  });

  it('treats any other URI scheme as external (shared semantic)', () => {
    // The shared predicate reads any scheme, so opaque ones leave the site
    // too — they must never get the relative base prefix.
    expect(isExternalHref('javascript:void 0')).toBe(true);
    expect(isExternalHref('bitcoin:1abc')).toBe(true);
  });

  it('keeps site routes, anchors and relative paths internal', () => {
    expect(isExternalHref('/a/b.html')).toBe(false);
    expect(isExternalHref('a/b.html')).toBe(false);
    expect(isExternalHref('./x.md')).toBe(false);
    expect(isExternalHref('#heading')).toBe(false);
  });
});

describe('isActiveRoute', () => {
  it('matches exactly and treats / as /index.html', () => {
    expect(isActiveRoute('/a.html', '/a.html')).toBe(true);
    expect(isActiveRoute('/', '/index.html')).toBe(true);
    expect(isActiveRoute('/a.html', '/b.html')).toBe(false);
  });
});

describe('stripLocalePrefix', () => {
  it('strips a matching prefix', () => {
    expect(stripLocalePrefix('/en/coding/foo.html', '/en')).toBe(
      '/coding/foo.html',
    );
  });

  it('maps a bare locale root to /index.html', () => {
    expect(stripLocalePrefix('/en', '/en')).toBe('/index.html');
  });

  it('leaves non-matching routes untouched', () => {
    expect(stripLocalePrefix('/coding/foo.html', '')).toBe('/coding/foo.html');
  });
});

describe('parseArchiveRoute', () => {
  it('parses category and tag routes', () => {
    expect(parseArchiveRoute('/category/foo.html')).toEqual({
      kind: 'category',
      name: 'foo',
    });
    expect(parseArchiveRoute('/en/tag/bar.html')).toEqual({
      kind: 'tag',
      name: 'bar',
    });
  });

  it('decodes uri-encoded names', () => {
    expect(parseArchiveRoute('/tag/%E5%B7%A5%E5%85%B7.html')?.name).toBe(
      '工具',
    );
  });

  it('returns null for normal routes', () => {
    expect(parseArchiveRoute('/coding/foo.html')).toBeNull();
    expect(parseArchiveRoute('/category/foo/bar.html')).toBeNull();
  });
});

describe('localePrefixOf', () => {
  it('returns the current locale route prefix', () => {
    expect(localePrefixOf(siteWithLocale('en'))).toBe('/en');
  });

  it('returns empty for the default locale and unknown keys', () => {
    expect(localePrefixOf(siteWithLocale('zh'))).toBe('');
    expect(localePrefixOf(siteWithLocale('fr'))).toBe('');
  });
});

describe('archiveHref', () => {
  it('builds archive links honoring base', () => {
    expect(archiveHref('../', '', 'tag', 'foo bar')).toBe(
      '../tag/foo%20bar.html',
    );
  });

  it('keeps the locale prefix so chips stay in their locale', () => {
    expect(archiveHref('', '/en', 'tag', 'english')).toBe(
      'en/tag/english.html',
    );
    expect(archiveHref('../', '/en', 'category', 'guide')).toBe(
      '../en/category/guide.html',
    );
  });
});
