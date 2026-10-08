import { foucScript } from '../../shared/prefs.ts';
import { seoPageType } from '../../shared/seo.ts';
import type { LocaleInfo, PagePayload } from '../../shared/types.ts';
import { escapeHtml } from '../escape.ts';
import { applyAssetBase } from './assets.ts';

/** '' at root, '../' one level deep — enables deploy under any subpath. */
export function baseOf(route: string): string {
  // Clean routes: '/a/b' -> depth 1; '/a/b/' (directory index) -> depth 1;
  // '/' -> depth 0.
  const depth = route.split('/').length - 2;
  return '../'.repeat(Math.max(0, depth));
}

export interface ShellInput {
  payload: PagePayload;
  /** Rendered markdown HTML (asset tokens allowed). */
  content: string;
  /** Client bundle URL: '/src/...' in dev, `${base}assets/x.js` in build. */
  scriptSrc: string;
  /** Extra stylesheet URLs, already base-prefixed or absolute. */
  cssHrefs: string[];
  /** KaTeX stylesheet URL (dev /@fs path or build asset). Omit on pages
   * without math: the ~23KB render-blocking css must not burden them. */
  katexHref?: string;
  locale: LocaleInfo;
  /** Canonical origin (no trailing slash) for canonical/og URLs. */
  hostname: string;
  /** Site config `seo.image` (raw): absolute URL or public-root path. */
  ogImage?: string;
  /** Google Analytics measurement id (e.g. 'G-XXX'); omitted when unset. */
  gaId?: string;
  /** Build only: emit the Speculation Rules script for same-site links. */
  speculationRules?: boolean;
}

/** Escape `</script>` (and friends) inside serialized inline JSON. */
export function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Speculative loading for same-site MPA navigations. Every link is a full
 * page load; when the target's render-blocking CSS is not immediately
 * available, Chrome's paint holding gives up and paints the parsed but
 * unstyled document (the reported flash between pages). These rules let
 * Chromium prefetch the target HTML on hover and prerender it on
 * pointerdown, so the styled page is ready before activation. Safari and
 * Firefox ignore the script type and keep normal (correct) navigation.
 * Document rules only ever match same-origin links.
 */
const SPECULATION_RULES = {
  prerender: [
    {
      source: 'document',
      where: {
        and: [
          { href_matches: '/*' },
          // Query-param URLs are rarely stable snapshots; skip them.
          { not: { href_matches: '/*\\?*' } },
          // Fragment-only links are same-document, never prerenderable.
          { not: { selector_matches: 'a[href^="#"]' } },
        ],
      },
      // Chrome's moderate preset: prefetch on hover, prerender on pointerdown.
      eagerness: 'moderate',
    },
  ],
} as const;

/**
 * gtag bootstrap. The id crosses two contexts and needs both escapes: the
 * query string is a double-quoted HTML attribute (escapeHtml), while the
 * inline call must embed a JS string — entities are NOT decoded inside
 * <script>, so escapeHtml would corrupt `&` and `'` would break the string.
 */
function gaLines(gaId: string): string[] {
  return [
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(gaId)}"></script>`,
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${serializeInlineJson(gaId)})</script>`,
  ];
}

/**
 * og:image value of the share card: absolute http(s) URLs pass through, a
 * public-root path (same resolution as the `logo` config) gets the hostname.
 */
function ogImageUrl(hostname: string, image: string): string {
  return /^https?:\/\//.test(image)
    ? image
    : `${hostname}/${image.replace(/^\/+/, '')}`;
}

export function renderShell(input: ShellInput): string {
  const { payload, content, scriptSrc, cssHrefs, locale } = input;
  const { site, page } = payload;
  const base = site.base;
  // Absolute URLs pass through; bare asset file names get the page base.
  const withBase = (href: string): string =>
    href.startsWith('/') || /^https?:\/\//.test(href) ? href : base + href;
  // A page title equal to the site title would double the suffix ("A | A");
  // pages without an h1 degrade to the site title alone.
  const title =
    page.title && page.title !== site.title
      ? `${page.title} | ${site.title}`
      : site.title;
  const url = `${input.hostname}${page.route}`;
  // Per-page summary from the payload excerpt; pages without one (archives,
  // empty bodies) fall back to the site description.
  const description = page.excerpt ?? site.description;
  // hreflang alternates: the payload carries the existence-checked
  // counterparts in config locale order (default first); x-default points
  // at the first entry, the default locale's version when it exists.
  const absOf = (route: string): string => `${input.hostname}${route}`;
  const alternates = page.alternates ?? [];
  const hreflangLinks = [
    ...alternates.map(
      a =>
        `<link rel="alternate" hreflang="${escapeHtml(a.lang)}" href="${escapeHtml(absOf(a.route))}">`,
    ),
    ...(alternates[0]
      ? [
          `<link rel="alternate" hreflang="x-default" href="${escapeHtml(absOf(alternates[0].route))}">`,
        ]
      : []),
  ];
  // Render-blocking stylesheets sit between the theme bootstrap script and
  // any third-party scripts: CSS discovery (hence first paint) must never
  // wait on script execution. katexHref stays first when present.
  const stylesheets = [
    ...(input.katexHref
      ? [
          `<link rel="stylesheet" href="${escapeHtml(withBase(input.katexHref))}">`,
        ]
      : []),
    ...cssHrefs.map(
      href => `<link rel="stylesheet" href="${escapeHtml(withBase(href))}">`,
    ),
  ];
  const lines = [
    '<!doctype html>',
    `<html lang="${escapeHtml(locale.lang)}" data-theme="light">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    ...hreflangLinks,
    // RSS autodiscovery. The feed is generated unconditionally (rss.xml
    // ships with every build and the dev middleware serves it), so the
    // link always has a live target.
    `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(site.title)}" href="${escapeHtml(`${input.hostname}/rss.xml`)}">`,
    `<meta property="og:type" content="${seoPageType(payload)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:site_name" content="${escapeHtml(site.title)}">`,
    ...(input.ogImage
      ? [
          `<meta property="og:image" content="${escapeHtml(ogImageUrl(input.hostname, input.ogImage))}">`,
        ]
      : []),
    // Card shape follows the image: without one, summary keeps a plain
    // title/description card instead of an empty large-image frame.
    `<meta name="twitter:card" content="${input.ogImage ? 'summary_large_image' : 'summary'}">`,
    // Pre-paint preference restore (theme + sidebar width), before any css.
    `<script>${foucScript()}</script>`,
    ...stylesheets,
    ...(input.gaId ? gaLines(input.gaId) : []),
    // Last in head: rules parsing must not delay stylesheet discovery.
    ...(input.speculationRules
      ? [
          `<script type="speculationrules">${serializeInlineJson(SPECULATION_RULES)}</script>`,
        ]
      : []),
    '</head>',
    '<body>',
    '<div id="ap-nav"></div>',
    '<aside id="ap-sidebar"></aside>',
    `<main id="ap-content">${content}</main>`,
    '<div id="ap-toc"></div>',
    // Site footer mount point (ArticleFooter); the body's flex column layout
    // pins it to the page bottom.
    '<footer id="ap-footer"></footer>',
    `<script type="application/json" id="__AP_DATA__">${serializeInlineJson(payload)}</script>`,
    `<script type="module" src="${escapeHtml(withBase(scriptSrc))}"></script>`,
    '</body>',
    '</html>',
  ];
  return applyAssetBase(lines.join('\n'), site.base);
}
