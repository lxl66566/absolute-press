import { hasUriScheme } from '../../shared/links.ts';
import type {
  ArticleInfo,
  LocaleInfo,
  PageAlternate,
} from '../../shared/types.ts';
import type { ResolvedConfig } from '../config.ts';
import { FEED_EXCERPT_LIMIT, plainExcerpt } from '../excerpt.ts';
import { ASSET_TOKEN } from './assets.ts';
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
 * ships either as a plain-text excerpt or, in `feed.full` mode, as the
 * URL-rewritten full content (see feedContent) — it is simply the only body
 * source; neither ArticleInfo nor PageMeta carries a full-content body.
 */
export interface FeedArticle extends ArticleInfo {
  /** Rendered markdown HTML; the body source of the item description. */
  html: string;
}

/** Default size of rss.xml (config `feed.rssLimit`). */
export const DEFAULT_RSS_LIMIT = 20;

/**
 * Rewrite on-site-relative href/src attribute values of full-content feed
 * HTML into absolute URLs. External (`http(s)://`, `//`, `data:`,
 * `mailto:`), `#`-anchored and site-absolute values pass through untouched;
 * only attribute positions are rewritten — a literal `absasset:` in prose or
 * code blocks is plain text and must survive verbatim (same contract as the
 * shell's applyAssetBase).
 *
 * Externalized xlist bodies leave only the empty slot skeleton in the page
 * html, so a full-content item of such a page describes the skeleton —
 * acceptable: feed consumers cannot fetch the lazily loaded asset.
 */
/**
 * A relative URL the rewrite resolves: no scheme, no protocol-relative
 * form, no site-absolute path, no fragment-only value.
 */
function isRewritableRelative(value: string): boolean {
  return (
    value !== '' &&
    !value.startsWith('/') &&
    !value.startsWith('#') &&
    !hasUriScheme(value)
  );
}

function feedContent(html: string, route: string, hostname: string): string {
  // Base for `./` `../` resolution: the route's directory segment, URL-encoded
  // form as-is (no decoding). `/guide/a` -> `<hostname>/guide/`,
  // `/guide/` -> `<hostname>/guide/`, `/` -> `<hostname>/`.
  const dir = hostname + route.slice(0, route.lastIndexOf('/') + 1);
  // The attribute name must open the attribute: a bare \b(src|href) also
  // matches the tail of data-src (`-` to `s` is a word boundary).
  return html.replace(
    /(^|[\s<])(src|href)=(["'])([^"']*)\3/g,
    (_m, lead: string, attr: string, quote: string, value: string): string => {
      let resolved: string;
      if (value.startsWith(ASSET_TOKEN)) {
        // Asset token: link targets carry the route (`guide/a`), images the
        // emitted file name (`assets/img/...`) — both sit under the origin
        // root, and hostname never ends with a slash.
        resolved = `${hostname}/${value.slice(ASSET_TOKEN.length)}`;
      } else if (isRewritableRelative(value)) {
        // Page-relative hrefs of rendered content: `./x`, `../x`, and the
        // bare same-directory form `x` (the shortest relativeRoute form on
        // root-depth pages). Other schemes and shapes pass through.
        resolved = new URL(value, dir).toString();
      } else {
        return _m;
      }
      return `${lead}${attr}=${quote}${resolved}${quote}`;
    },
  );
}

/**
 * `/rss.xml`: newest articles by createdAt; `feed: false` already filtered.
 * `locale` marks a per-locale feed: `<language>` takes that locale's BCP-47
 * tag and the self reference points at `<prefix>/rss.xml`; absent keeps
 * the site-wide feed, which declares the default locale and self-links
 * the root `/rss.xml`.
 */
export function renderRss(
  config: ResolvedConfig,
  articles: FeedArticle[],
  locale?: LocaleInfo,
): string {
  const items = articles.slice(0, config.feed.rssLimit).map(a => {
    const link = `${config.hostname}${a.route}`;
    const description = config.feed.full
      ? feedContent(a.html, a.route, config.hostname)
      : plainExcerpt(a.html, FEED_EXCERPT_LIMIT);
    return [
      '<item>',
      `<title>${escapeXml(a.title)}</title>`,
      `<link>${escapeXml(link)}</link>`,
      `<guid>${escapeXml(link)}</guid>`,
      `<description>${escapeXml(description)}</description>`,
      ...(a.createdAt
        ? [`<pubDate>${new Date(a.createdAt).toUTCString()}</pubDate>`]
        : []),
      ...a.category.map(c => `<category>${escapeXml(c)}</category>`),
      '</item>',
    ].join('');
  });
  // Self reference follows the feed's own URL: the site-wide /rss.xml or
  // the per-locale <prefix>/rss.xml.
  const feedUrl = `${config.hostname}${locale?.prefix ?? ''}/rss.xml`;
  // Site-wide feed: the default locale's BCP-47 tag; a per-locale feed
  // declares its own locale.
  // locales[0] always exists (resolveConfig puts the default first); the
  // optional chain only satisfies noUncheckedIndexedAccess.
  const lang = locale?.lang ?? config.locales[0]?.lang;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(config.title)}</title>`,
    `<link>${escapeXml(config.hostname)}</link>`,
    `<description>${escapeXml(config.description)}</description>`,
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
    ...(config.seo?.exclude ?? []).map(p => `Disallow: ${p}`),
    '',
    `Sitemap: ${config.hostname}/sitemap.xml`,
    '',
  ].join('\n');
}
