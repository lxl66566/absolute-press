import { describe, expect, it } from 'vitest';

import {
  en,
  formatMessage,
  messagesForLang,
  messagesForSite,
  zh,
} from '../../../shared/i18n/index.ts';
import type { LocaleInfo } from '../../../shared/types.ts';
import { useMessages } from '../i18n';

/** Leaf key paths of a nested messages object. */
function keyPaths(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? keyPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('i18n key parity', () => {
  it('en has exactly the same keys as zh', () => {
    expect(keyPaths(en).toSorted()).toEqual(keyPaths(zh).toSorted());
  });
});

describe('messagesForLang', () => {
  it('matches the lang prefix', () => {
    expect(messagesForLang('en')).toBe(en);
    expect(messagesForLang('en-US')).toBe(en);
    expect(messagesForLang('zh-CN')).toBe(zh);
  });

  it('falls back to zh for unknown or missing langs', () => {
    expect(messagesForLang('fr')).toBe(zh);
    expect(messagesForLang(undefined)).toBe(zh);
  });
});

/** One-locale site block fixture keyed by lang. */
function localeSite(lang: string): { locale: string; locales: LocaleInfo[] } {
  return {
    locale: 'root',
    locales: [{ key: 'root', lang, label: 'x', prefix: '' }],
  };
}

describe('useMessages', () => {
  it('resolves chrome copy from the default locale lang', () => {
    // 'root' is no table name: resolution must go through the locales
    // table's lang, so an English default site gets en chrome copy.
    expect(useMessages(() => localeSite('en-US'))).toBe(en);
  });

  it('keeps zh sites unchanged', () => {
    expect(useMessages(() => localeSite('zh-CN'))).toBe(zh);
  });

  it('falls back to zh for unknown langs', () => {
    expect(useMessages(() => localeSite('fr'))).toBe(zh);
  });
});

describe('messagesForSite', () => {
  it('maps the locale key through the locales table', () => {
    const site = {
      locale: 'en',
      locales: [
        { key: 'root', lang: 'zh-CN', label: 'zh', prefix: '' },
        { key: 'en', lang: 'en', label: 'English', prefix: '/en' },
      ],
    };
    expect(messagesForSite(site)).toBe(en);
    expect(messagesForSite({ ...site, locale: 'root' })).toBe(zh);
  });
});

describe('formatMessage', () => {
  it('fills placeholders', () => {
    expect(formatMessage('第 {n} 页', { n: 3 })).toBe('第 3 页');
    expect(formatMessage('分类：{name}', { name: 'foo' })).toBe('分类：foo');
  });

  it('keeps unknown placeholders as-is', () => {
    expect(formatMessage('{a} {b}', { a: 'x' })).toBe('x {b}');
  });
});
