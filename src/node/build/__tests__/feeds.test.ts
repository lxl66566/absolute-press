import { describe, expect, it } from 'vitest';

import type { LocaleInfo } from '../../../shared/types.ts';
import type { ResolvedConfig } from '../../config.ts';
import { renderRss, renderSitemap } from '../feeds.ts';
import type { FeedArticle } from '../feeds.ts';

const config = { hostname: 'https://example.com' } as ResolvedConfig;

const RSS_LOCALE: LocaleInfo = {
  key: 'root',
  lang: 'zh-CN',
  label: 'zh',
  prefix: '',
};
const rssConfig = {
  hostname: 'https://example.com',
  title: 'Site',
  description: 'site description',
  locales: [RSS_LOCALE],
  feed: { rssLimit: 20 },
} as ResolvedConfig;

function article(n: number, html = '<p>Body text.</p>'): FeedArticle {
  return {
    route: `/a${n}`,
    title: `Article ${n}`,
    createdAt: '2024-06-01T12:30:00+08:00',
    updatedAt: null,
    category: [],
    tag: [],
    html,
  };
}

describe('renderRss', () => {
  it('caps the channel at the configured rssLimit', () => {
    const xml = renderRss(
      rssConfig,
      Array.from({ length: 25 }, (_, i) => article(i + 1)),
    );
    expect(xml.match(/<item>/g)).toHaveLength(20);
    expect(xml).toContain('https://example.com/a20');
    expect(xml).not.toContain('https://example.com/a21');
    const bigger = renderRss(
      { ...rssConfig, feed: { rssLimit: 3 } },
      Array.from({ length: 25 }, (_, i) => article(i + 1)),
    );
    expect(bigger.match(/<item>/g)).toHaveLength(3);
    expect(bigger).toContain('https://example.com/a3');
    expect(bigger).not.toContain('https://example.com/a4');
  });

  it('formats pubDate as RFC 822 GMT', () => {
    const xml = renderRss(rssConfig, [article(1)]);
    expect(xml).toContain('<pubDate>Sat, 01 Jun 2024 04:30:00 GMT</pubDate>');
  });

  it('omits pubDate when createdAt is unknown', () => {
    const a = { ...article(1), createdAt: null };
    expect(renderRss(rssConfig, [a])).not.toContain('<pubDate>');
  });

  it('escapes all five XML entities in text fields', () => {
    const a = { ...article(1), title: `T&<>"'x`, category: [`C&<>"'y`] };
    const xml = renderRss(rssConfig, [a]);
    expect(xml).toContain('<title>T&amp;&lt;&gt;&quot;&apos;x</title>');
    expect(xml).toContain('<category>C&amp;&lt;&gt;&quot;&apos;y</category>');
  });

  it('describes items with a plain-text excerpt of the content', () => {
    const a = article(
      1,
      '<p>Hello <em>world</em> &amp; welcome <code>absasset:x.png</code></p>',
    );
    expect(renderRss(rssConfig, [a])).toContain(
      '<description>Hello world &amp; welcome absasset:x.png</description>',
    );
  });

  it('skips leading code fences and truncates long excerpts', () => {
    const body = 'x'.repeat(400);
    const a = article(
      1,
      `<pre><code>hidden boilerplate</code></pre><p>${body}</p>`,
    );
    const xml = renderRss(rssConfig, [a]);
    expect(xml).not.toContain('hidden');
    expect(xml).toContain(`<description>${'x'.repeat(200)}…</description>`);
  });

  it('declares the default locale language and an atom self link', () => {
    const xml = renderRss(rssConfig, [article(1)]);
    expect(xml).toContain(
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    );
    expect(xml).toContain('<language>zh-CN</language>');
    expect(xml).toContain(
      '<atom:link href="https://example.com/rss.xml" rel="self" ' +
        'type="application/rss+xml"/>',
    );
  });
});

describe('renderSitemap', () => {
  it('emits lastmod normalized to W3C UTC datetime', () => {
    const xml = renderSitemap(config, [
      { route: '/a', lastmod: '2024-06-01T12:30:00+08:00' },
    ]);
    expect(xml).toContain(
      '<url><loc>https://example.com/a</loc>' +
        '<lastmod>2024-06-01T04:30:00.000Z</lastmod></url>',
    );
  });

  it('omits lastmod for entries without a git time', () => {
    const xml = renderSitemap(config, [{ route: '/tag/x', lastmod: null }]);
    expect(xml).toContain('<url><loc>https://example.com/tag/x</loc></url>');
    expect(xml).not.toContain('lastmod');
  });

  it('escapes the loc and keeps urlset order', () => {
    const xml = renderSitemap(config, [
      { route: '/a&b', lastmod: null },
      { route: '/z', lastmod: null },
    ]);
    expect(xml).toContain('<loc>https://example.com/a&amp;b</loc>');
    expect(xml.indexOf('/a&b') === -1).toBe(true);
    expect(xml.indexOf('a&amp;b')).toBeLessThan(xml.indexOf('/z'));
  });

  it('declares the xhtml namespace and hreflang alternates with x-default', () => {
    const xml = renderSitemap(config, [
      {
        route: '/guide/a',
        lastmod: null,
        alternates: [
          { lang: 'zh-CN', route: '/guide/a' },
          { lang: 'en', route: '/en/guide/a' },
        ],
      },
    ]);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="zh-CN" href="https://example.com/guide/a"/>',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/guide/a"/>',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/guide/a"/>',
    );
  });

  it('emits plain url rows without alternate links when alternates are absent', () => {
    const xml = renderSitemap(config, [{ route: '/a', lastmod: null }]);
    expect(xml).not.toContain('xhtml:link');
    expect(xml).toContain('<loc>https://example.com/a</loc>');
  });
});
