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
    expect(withBase('', '/a/b')).toBe('a/b');
    // Home route joins to the bare base; '' becomes './' (see withBase).
    expect(withBase('', '/')).toBe('./');
    expect(withBase('../', '/')).toBe('../');
    expect(withBase('../', '/a/b')).toBe('../a/b');
    expect(withBase('../../', '/')).toBe('../../');
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
    expect(isExternalHref('/a/b')).toBe(false);
    expect(isExternalHref('a/b')).toBe(false);
    expect(isExternalHref('./x.md')).toBe(false);
    expect(isExternalHref('#heading')).toBe(false);
  });
});

describe('isActiveRoute', () => {
  it('matches exactly and tolerates a trailing slash', () => {
    expect(isActiveRoute('/a', '/a')).toBe(true);
    expect(isActiveRoute('/guide/', '/guide')).toBe(true);
    expect(isActiveRoute('/', '/')).toBe(true);
    expect(isActiveRoute('/a', '/b')).toBe(false);
  });
});

describe('stripLocalePrefix', () => {
  it('strips a matching prefix', () => {
    expect(stripLocalePrefix('/en/coding/foo', '/en')).toBe('/coding/foo');
  });

  it('maps a bare locale root to /', () => {
    expect(stripLocalePrefix('/en', '/en')).toBe('/');
    expect(stripLocalePrefix('/en/', '/en')).toBe('/');
  });

  it('leaves non-matching routes untouched', () => {
    expect(stripLocalePrefix('/coding/foo', '')).toBe('/coding/foo');
  });
});

describe('parseArchiveRoute', () => {
  it('parses category and tag routes', () => {
    expect(parseArchiveRoute('/category/foo')).toEqual({
      kind: 'category',
      name: 'foo',
    });
    expect(parseArchiveRoute('/en/tag/bar')).toEqual({
      kind: 'tag',
      name: 'bar',
    });
  });

  it('decodes uri-encoded names', () => {
    expect(parseArchiveRoute('/tag/%E5%B7%A5%E5%85%B7')?.name).toBe('工具');
  });

  it('returns null for normal routes', () => {
    expect(parseArchiveRoute('/coding/foo')).toBeNull();
    expect(parseArchiveRoute('/category/foo/bar')).toBeNull();
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
    expect(archiveHref('../', '', 'tag', 'foo bar')).toBe('../tag/foo%20bar');
  });

  it('keeps the locale prefix so chips stay in their locale', () => {
    expect(archiveHref('', '/en', 'tag', 'english')).toBe('en/tag/english');
    expect(archiveHref('../', '/en', 'category', 'guide')).toBe(
      '../en/category/guide',
    );
  });
});
