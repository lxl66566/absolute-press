import type { ArticleInfo, PageAlternate } from '../../shared/types.ts';
import type { ResolvedConfig } from '../config.ts';
import { FEED_EXCERPT_LIMIT, plainExcerpt } from '../excerpt.ts';
import { encryptDisallowPaths } from './encrypt.ts';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Feed item input: article info plus the rendered content HTML. The HTML
 * never ships as-is (see plainExcerpt); it is simply the only body source —
 * neither ArticleInfo nor PageMeta carries a full-content body.
 */
export interface FeedArticle extends ArticleInfo {
  /** Rendered markdown HTML; reduced to a plain-text excerpt for the feed. */
  html: string;
}

/** Default size of rss.xml (config `feed.rssLimit`). */
export const DEFAULT_RSS_LIMIT = 20;

/** `/rss.xml`: newest articles by createdAt; `feed: false` already filtered. */
export function renderRss(
  config: ResolvedConfig,
  articles: FeedArticle[],
): string {
  const items = articles.slice(0, config.feed.rssLimit).map(a => {
    const link = `${config.hostname}${a.route}`;
    return [
      '<item>',
      `<title>${escapeXml(a.title)}</title>`,
      `<link>${escapeXml(link)}</link>`,
      `<guid>${escapeXml(link)}</guid>`,
      `<description>${escapeXml(plainExcerpt(a.html, FEED_EXCERPT_LIMIT))}</description>`,
      ...(a.createdAt
        ? [`<pubDate>${new Date(a.createdAt).toUTCString()}</pubDate>`]
        : []),
      ...a.category.map(c => `<category>${escapeXml(c)}</category>`),
      '</item>',
    ].join('');
  });
  const feedUrl = `${config.hostname}/rss.xml`;
  const lang = config.locales[0]?.lang;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(config.title)}</title>`,
    `<link>${escapeXml(config.hostname)}</link>`,
    `<description>${escapeXml(config.description)}</description>`,
    // The feed is single-language: the default locale's BCP-47 tag.
    // locales[0] always exists (resolveConfig puts the default first); the
    // optional chain only satisfies noUncheckedIndexedAccess.
    ...(lang ? [`<language>${escapeXml(lang)}</language>`] : []),
    // RSS best practice: tell auto-discovery where this feed itself lives.
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    '</channel>',
    '</rss>',
    '',
  ].join('\n');
}

/** One sitemap `<url>` row. */
export interface SitemapEntry {
  route: string;
  /** Last meaningful modification (any ISO form); omitted when unknown. */
  lastmod: string | null;
  /**
   * hreflang alternates of the page, config locale order (first entry is
   * the x-default target); omitted when no cross-locale counterpart exists.
   */
  alternates?: PageAlternate[];
}

export function renderSitemap(
  config: ResolvedConfig,
  entries: SitemapEntry[],
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    // The xhtml namespace hosts the hreflang alternate links.
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries.map(e => {
      const lastmod = e.lastmod ? `<lastmod>${w3c(e.lastmod)}</lastmod>` : '';
      const loc = escapeXml(config.hostname + e.route);
      // Mirrors the shell's head links: one xhtml:link per counterpart,
      // x-default pointing at the first (default-locale) entry.
      const alternates = (e.alternates ?? []).map(
        a =>
          `<xhtml:link rel="alternate" hreflang="${escapeXml(a.lang)}" href="${escapeXml(config.hostname + a.route)}"/>`,
      );
      const xDefault = e.alternates?.[0]
        ? `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(config.hostname + e.alternates[0].route)}"/>`
        : '';
      return `<url><loc>${loc}</loc>${alternates.join('')}${xDefault}${lastmod}</url>`;
    }),
    '</urlset>',
    '',
  ].join('\n');
}

/** Normalize to W3C datetime (UTC); pass through when unparsable. */
function w3c(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString();
}

export function renderRobots(config: ResolvedConfig): string {
  return [
    'User-agent: *',
    'Allow: /',
    // String encrypt rules double as crawl exclusions; RegExp rules cannot
    // be expressed as robots patterns and stay unlisted (see encrypt docs).
    ...encryptDisallowPaths(config.encrypt).map(p => `Disallow: ${p}`),
    '',
    `Sitemap: ${config.hostname}/sitemap.xml`,
    '',
  ].join('\n');
}
