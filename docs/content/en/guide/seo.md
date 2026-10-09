---
date: 2026-10-03
category:
  - guide
tag:
  - seo
  - rss
icon: solid/magnifying-glass
---

# SEO and Feeds

Every page's `<head>`, the feed, and the sitemap are fully generated at build time; there is no runtime SEO handling. This page lists where each output comes from and what you can tune.

## Page head

Each page's head is written by the build layer (see `src/node/build/shell.ts`):

| Item                        | Value                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `<title>`                   | `Page title \| Site name`; if the page has no h1 or the title equals the site name, only the site name is kept                |
| `meta description`          | Plain-text excerpt of the content (about 160 chars); falls back to the site `description` when there is no content            |
| `link canonical`            | `hostname + page route`                                                                                                       |
| `og:type`                   | `website` for locale home pages and category/tag archive pages, `article` for everything else                                 |
| `og:title` / `og:site_name` | Page title (with site-name suffix) / site name                                                                                |
| `og:description`            | Same as `meta description` (page excerpt takes priority)                                                                      |
| `og:url`                    | `hostname + page route`                                                                                                       |
| `og:image` / `twitter:card` | With `seo.image` configured: absolute image URL + `summary_large_image`; otherwise only `twitter:card: summary`               |
| `link icon`                 | With `favicon` configured; `type` derived from the extension (ico/png/svg/webp)                                               |
| `script ld+json`            | Structured data: WebSite on locale home pages, BlogPosting on articles (headline, dates, `seo.author`); none on archive pages |
| `link alternate (rss+xml)`  | RSS autodiscovery for `<hostname>/rss.xml`                                                                                    |
| `link alternate (hreflang)` | Cross-locale mirror pages: one entry per corresponding locale + `x-default` (the default locale version)                      |
| `<html lang>`               | The `lang` value of the owning locale                                                                                         |

The excerpt is extracted once at build time from the rendered content (skipping code fences and script/style, truncating after decoding entities), shares its lifecycle with the render cache, and ships with the payload (`page.excerpt`); the soft-navigation client-side sync logic reuses the same copy. The site `description` is still the fallback for pages without content, so write it with care.

hreflang interlinking is derived from "cross-locale mirror pages with the same relPath": locale directories mirror the structure by convention, but the framework does not guarantee every page has a translation in every locale, so each interlink is verified at build time against the full page list — pages missing a translation quietly opt out (no fabricated URLs). Pages that exist in only one locale emit no hreflang. Archive pages work the same way, derived from "cross-locale archive pages with the same category/tag name".

The content is fully readable without JavaScript: headings, body, and TOC anchors are all static HTML — crawlers receive the final content, and there is no client-rendered blank page.

## RSS

The build artifact `rss.xml`:

- Collects articles from the default locale and every other locale, taking the latest `feed.rssLimit` (default 20) by `createdAt` descending; see [Configuration reference](./configuration.md#feed)
- Pages with frontmatter `feed: false` leave the feed (the home article feed still includes them)
- Each item carries title, absolute link (joined with `hostname`), `pubDate` (from `date`), and `category`

The feed address is simply `<hostname>/rss.xml` — point a reader at it; every page's head also emits `<link rel="alternate" type="application/rss+xml">` with that address, so readers can auto-discover the feed.

## sitemap and robots.txt

- `sitemap.xml`: all page routes (including archive pages and every locale), each `<loc>` joined with `hostname` into an absolute URL; content pages carry `<lastmod>` (the file's last git commit time, W3C UTC format), archive pages have no source file so they don't; entries with cross-locale mirror pages carry `xhtml:link` hreflang interlinks (consistent with the page head). Pages matched by `encrypt` rules or an `seo.exclude` prefix stay out — a sitemap entry hands the URL to crawlers, contradicting the unlisted posture
- `robots.txt`: `User-agent: * / Allow: /` plus one `Sitemap: <hostname>/sitemap.xml` line; each string `encrypt` rule and each `seo.exclude` prefix adds a `Disallow` (the same normalized path the matcher sees, non-ASCII routes in decoded form); RegExp rules cannot be expressed as robots patterns and are not written

Both are generated by the build layer; changing domains means editing only the `hostname` config, no manual maintenance.

## 404 page

The build also emits a fully self-contained `404.html` (no external css/js/fonts); static hosts like Cloudflare Pages and GitHub Pages serve it for unknown paths, avoiding the soft-404 — an arbitrary path returning 200 + the home page gets indexed by search engines. The page carries `<meta name="robots" content="noindex">`, its copy and `<html lang>` follow the default locale, and light/dark come from an inline `prefers-color-scheme` media query.

Two known boundaries:

- A 404 is served at whatever URL depth was requested, so relative paths would break and the page must be fully inline; for the same reason the home link is the root-absolute `href="/"` — the build cannot know the deploy sub-path, so under a sub-path deployment (like `https://user.github.io/repo/`) it points at the domain root, not the site root
- Drop a `404.md` at the content root to replace the generated fallback with your own page

## Other head injections

- **Google Analytics**: with `googleAnalytics: 'G-XXX'` configured, the gtag script is injected, loaded async; a successful soft navigation (client-side page swap without reload) reports a `page_view` event, keeping the stats consistent with full page loads
- **modulepreload** (build output only): the head opens with a `<link rel="modulepreload">` for the entry script, so the browser starts downloading the entry chunk before a large HTML has finished streaming; dev's on-demand-compiled entry is not preloaded
- **Speculation Rules** (build output only): Chromium prefetches internal links (on hover) and prerenders them (on pointer down), so MPA navigation feels close to an SPA on supported platforms; Safari/Firefox ignore it and keep plain navigation
- **Anti-FOUC script**: before first paint, reads the theme from localStorage and writes `html[data-theme]`, avoiding a light/dark flash; the script depends on no external resource

## Checklist

Quick self-check before going live:

- [ ] `hostname` is the real domain (not `localhost`); canonical/RSS/sitemap are all joined from it
- [ ] Every page's first h1 is the first half of the `<title>` you want
- [ ] `description` covers the site's positioning; for a multi-locale site without per-locale description needs, keep the copy neutral
- [ ] Sensitive pages (protected by the password gate) have `feed: false` set
- [ ] `rss.xml` / `sitemap.xml` / `robots.txt` / `404.html` exist at the output root and their links are reachable
