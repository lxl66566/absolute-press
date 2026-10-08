---
date: 2026-10-02
category:
  - guide
tag:
  - configuration
icon: gear
---

# Configuration Reference

Site config is passed in via `absolutePress(defineSiteConfig({...}))`. Type definitions live in `src/shared/types.ts` (`SiteConfig`) and `src/node/config.ts` (`AbsolutePressConfig`, the build-layer extension). This page goes field by field; the implementation is the source of truth.

## Basic fields

- `contentDir` (required, string): content root of the default locale, relative to the project root
- `title` (required, string): site name; goes into `<title>`, RSS, and the sitemap
- `description` (required, string): site description; goes into SEO meta and the RSS channel
- `hostname` (required, string): canonical origin (no trailing slash), used for absolute links in SEO og tags, the sitemap, and RSS, e.g. `https://absolute-docs.pages.dev`
- `favicon` (optional, string): site favicon, resolved against the site public root (same semantics as `nav.logo`), e.g. `/favicon.svg`; at build time emits `<link rel="icon">` with the `type` derived from the extension (ico/png/svg/webp, other extensions ship without `type`), and the href gets the page-depth relative prefix so subpath deploys never break it

## locales

```ts
locales: {
  en: { lang: 'en', label: 'English' },
}
```

- The default locale always occupies the contentDir root. `<html lang>` defaults to `zh-CN` and the switcher label defaults to `简体中文`; override with the top-level `lang` / `label`
- Other locales put their content in `<contentDir>/<key>/`, and their routes get an `/en`-style prefix
- See [Internationalization](./i18n.md)

## icons

```ts
icons: {
  rocket: '<svg xmlns="..." viewBox="0 0 512 512" fill="currentColor">...</svg>',
}
```

An explicitly registered icon map: the key is a legal value for frontmatter `icon` (validated at build time; unregistered keys fail the build). The value is a full `<svg>...</svg>` string, or bare SVG inner markup (the client wraps it in a 24x24 svg). The navbar, sidebar, and article cards consume these icons.

## islands

```ts
islands: {
  Counter: 'docs/islands/Counter.tsx',
}
```

Custom islands added by the site: PascalCase tag name → module path relative to the project root. This is the extension point beyond the built-in list (Giscus/PasswordGate/ZoomedImg/Mermaid/G2Plot/ExpandableList). See [Islands](./islands.md).

## encrypt

```ts
encrypt: [
  {
    match: '/guide/secret', // string equality on the route, or RegExp.test
    passwords: ['docs-demo'],
    hint: 'optional hint text',
  },
];
```

An array of client-side password-gate rules: pages whose route matches `match` (exact string or regex; avoid the `/g` flag) get their content wrapped in the PasswordGate island, and unlock after entering a password whose sha256 matches. The unlocked state is remembered per route in sessionStorage. Write non-ASCII routes (e.g. Chinese) as plain decoded paths (matching runs against the decoded route, and regexes see the decoded form too), not percent-encoded. Plaintext passwords never enter the page payload (only sha256 hex is emitted). See [Encryption](./encrypt.md).

## algolia

```ts
algolia: {
  appId: 'XXX',
  apiKey: 'xxx',
  indexName: 'xxx',
}
```

When configured, the theme chrome mounts an Algolia DocSearch box, and the credentials go into the page payload.

## giscus

```ts
giscus: {
  repo: 'owner/repo',
  repoId: 'R_xxx',
  category: 'General',
  categoryId: 'DIC_xxx',
}
```

When configured, a Giscus comment island is mounted automatically at the end of article pages (no manual tag in markdown). The comment iframe theme follows site light/dark switching without reloading the iframe.

## googleAnalytics

```ts
googleAnalytics: 'G-XXXXXXX',
```

A measurement ID string; the GA script is injected at build time. The framework sends a `page_view` after every SPA soft navigation (the initial load is counted by GA itself); disable "Page views based on browser history events" in the GA4 data stream's enhanced measurement, or soft navigations are double-counted.

## nav

```ts
nav: {
  exclude: ['/hide'], // route prefixes excluded from navbar/sidebar (pages are still built)
  logo: '/logo.jpg', // brand image for the navbar (and mobile drawer)
  align: 'center', // top-level navbar alignment: 'left' (default) | 'center'
  order: ['coding', 'hobbies'], // order top-level entries by content directory name
  tweaks: { /* per-top-level-directory navbar tweaks, see below */ },
  social: [
    { icon: 'github', url: 'https://github.com/owner/repo', title: 'GitHub' },
  ],
}
```

The single entry point for navbar-related config: the nav tree is generated from the content directories, and `nav.*` only reshapes the generated result.

- `exclude: string[]`: route prefixes excluded from navbar/sidebar (pages are still built). The frontmatter contract has no hide key; "exists but not in nav" is a site-config concern
- `logo: string`: brand image for the navbar (and mobile drawer), resolved against the site public root (`'/logo.jpg'` -> `public/logo.jpg`); the client prefixes it with the depth-based relative prefix
- `order: string[]`: orders top-level navbar entries by content directory name (same key space as `tweaks`); directories not listed and root-level loose pages keep their generated order; unknown names are ignored
- `align: 'left' | 'center'`: alignment of the top-level navbar strip; with `'center'` the remaining space between the brand area and the right icon area is split evenly (default `'left'`)
- `tweaks: Record<string, NavbarDirTweak>`: tweaks navbar entries per top-level content directory. `label` rewrites the nav text (the sidebar group title follows it). `groups` lays out the dropdown panel by groups (a group with `text` renders a static subheading; a group without `text` only fixes member order; unlisted members are appended in generated order). `items` specifies the panel entries wholesale (e.g. a section tree derived from a site data module); every internal link is validated at build time to point to a page under that directory; generated members not covered by any item link are still appended; takes precedence over `groups`. Entries without an explicit `icon` inherit the linked page's frontmatter icon. Folder rows (at any depth) navigate to the directory index page (the section name is the overview): the overview row carrying the `index` marker renders as the first row of the panel (the client sets an `ap-nav-index-row` hook; badge/divider styling belongs to site CSS) — the overview row of a top-level panel is generated at build time, the overview row of a nested folder is synthesized by the client as its panel's first row, and the folder row itself only expands. An index page with frontmatter `overview: false` opts out of the overview row (the folder row still points to that page; the sidebar is unaffected)
- `social: { icon, url, title }[]`: social icon buttons on the right of the navbar, rendered before the RSS button, always opened in a new tab. `icon` takes a key from config `icons`, or a built-in brand key (`github` / `telegram` / `bilibili`); on name collision config `icons` wins. `title` is used as aria-label and hover tooltip

The navbar also always renders an RSS button (linking `/rss.xml`, base-aware, title from i18n `nav.rss`); RSS is always generated, no config switch.

## sidebar

```ts
sidebar: {
  order: ['blog', 'guide'], // top-level groups ordered by content directory name
  tweaks: {
    guide: ['getting-started', 'writing', 'markdown'], // member order inside one directory
    'guide/advanced': ['deep'], // nested directories are keyed by their content-root-relative path
  },
}
```

The sidebar is generated complete from the content directory tree; `sidebar.*` only reorders the generated result — entries can be rearranged, never dropped (hiding pages is `nav.exclude`).

- `order: string[]`: top-level groups ordered by content directory name, same semantics as `nav.order`; loose pages join directories as orderable entries (a page takes its file stem). Listed entries come first (config order), unknown names are skipped, the rest keep their generated order
- `tweaks: Record<string, string[]>`: member order inside one directory. The key is the directory's path from the content root — a top-level directory is its bare name, nested directories join segments with `/` (e.g. `guide/advanced`); the value is an ordered list of member names, extension-less and relative to that directory (a page takes its file stem, a subdirectory its name; the directory index page is not a member — the folder row already links there). Listed members come first (config order), unknown names are skipped, unlisted members keep their generated order — an order list reorders, it can never make an entry disappear

## seo

```ts
seo: {
  image: '/og.png', // share-card image, resolved against the site public root or an absolute URL
  author: { name: 'Alice', url: 'https://example.com/about' }, // JSON-LD author, url optional
}
```

SEO head options: `image` is the share-card image. At build time it produces `og:image` (a relative value like `'/og.png'` resolves against the site public root and is joined with `hostname` into an absolute URL, same semantics as `nav.logo`; an absolute `https://` URL passes through unchanged) and upgrades `twitter:card` to `summary_large_image`. Without it, only `twitter:card: summary` is emitted (card without image), and no `og:image`. `author` is the author of the article-page BlogPosting JSON-LD (schema.org Person); when unset or blank-named, no `author` field is emitted. Each page's `meta description` comes from the content excerpt (see [SEO](./seo.md)); no per-page config needed.

## related

```ts
related: {
  depth: 1, // 1 | 2 | 3, default 1
  maxNodes: 60, // per-page graph node cap (including the current page), default 60
  maxEdges: 240, // per-page member edge cap, default 240
  twoHopNodeLimit: 48, // hub-page fallback threshold, default 48
}
```

Aggregation scope of the related-articles graph: `depth` is the BFS depth over the cross-link graph — `1` collects only first-degree mutual neighbors (default); `2`/`3` also collect articles within two/three hops together with the real edges among them. Values outside 1/2/3 fail the build.

- "Cross-linked" means there is an internal link in either direction between two articles; repeated links between the same pair accumulate into `refs`, which decides edge thickness and neighbor ordering
- The payload has protective caps (per page, 60 nodes and 240 member edges by default, adjustable via `maxNodes`/`maxEdges`, which must be integers no less than 2/1); overflow is truncated by reference strength, so raising `depth` will not blow up the payload. On large, densely linked sites, raise both caps together
- `twoHopNodeLimit` is the hub fallback threshold for multi-hop graphs: when a page's related node count (including itself) exceeds it, only first-degree neighbors render, and `depth` hops are not expanded; if the first-degree star itself exceeds the cap, only the strongest mutual references are kept — a dense hub page would otherwise cram labels together, and the fallback keeps a readable star (it is effectively the render node cap of the graph)
- The client graph supports zoom/pan/node drag/click-to-navigate; it auto-fits on init (with a zoom cap so the default view keeps text compact and readable) and hides labels when zoomed out. See [Islands](./islands.md) for interactions

## code

```ts
code: {
  lineNumbers: true,         // code block line numbers, default true
  collapsedLines: 15,        // collapse blocks longer than N lines; null explicitly disables collapsing, default 15
  wrap: true,                // soft wrap, default true
  copyLabel: 'Copy code',    // aria-label/title of the copy button, for UI localization
}
```

Site-level defaults for code block rendering (consumed by the markdown pipeline): `collapsedLines` uses `??=` semantics to distinguish "not configured" from "explicit `null`" — only writing `null` turns off collapsing. Each code block can override the site defaults with fence meta: `{1,3-5}` line highlights, `title="..."`, `:collapsed-lines[=N]`, `:no-collapsed-lines`, `:wrap=true|false`. Syntax and demos in [Markdown extensions](./markdown.md#code-highlighting).

## home

```ts
home: {
  feed: true, // default true
  feedPerPage: 3, // articles per page in the home feed, default 3
}
```

Home page options: `feed` controls whether the paginated article feed renders at the top of each locale home page. Blog home pages keep the default; docs/landing-style home pages can set `false` so the content intro (hero/features/reading path) becomes the visual focus. `feedPerPage` is the page size of the article feed (client-side pagination, must be an integer no less than 1); it is only written into the page payload when non-default.

## archive

```ts
archive: {
  perPage: 10, // articles per page on category/tag archive pages, default 10
}
```

Archive page options: the page size of each category/tag archive page (`/category/*`, `/tag/*`); client-side pagination, must be an integer no less than 1; only written into the page payload when non-default.

## urls

```ts
urls: {
  directoryIndex: 'slash', // 'slash' | 'bare', default 'slash'
}
```

URL shape options. One key for now: the canonical route of a directory index page (`guide/index.md`).

- `'slash'` (default): `/guide/`. The native GitHub Pages form — zero redirects
- `'bare'`: `/guide`. The native Cloudflare Pages form (CF 308s `/guide/` to `/guide`)

Each platform redirects the other's form once (GH 301s `/guide` to `/guide/`, CF the reverse); no shape is redirect-free on both, so pick by hosting platform. Emitted file names are unaffected — always `guide/index.html`.

## feed

```ts
feed: {
  rssLimit: 20, // number of latest articles included in rss.xml, default 20
}
```

Feed options: the cap on how many latest articles `rss.xml` collects across all locales (pages with `feed: false` are always excluded); must be an integer no less than 1. Full-text RSS would require rewriting internal resource links to absolute URLs, which the framework deliberately does not do (excerpt + link is the practical shape of a feed); the only knob is the item count.

## footer

```ts
footer: {
  credit: '© 2026 Someone',
}
```

Footer: on desktop a single two-column row, with a fixed "Powered by absolute-press" link to the framework repository on the right. The left credit line (shared by the desktop footer and the mobile drawer bottom) defaults to a CC icon plus the framework name; when configured, it is replaced wholesale with custom plain text (the component does not parse HTML; use site CSS or a custom island if you need icons). A whitespace-only string counts as not configured.

## deploy

```ts
deploy: {
  cloudflare: true, // default false
}
```

Switches for deployment-target artifacts. With `cloudflare: true` the build additionally emits a Cloudflare Pages `_headers` file: `/assets/*` (all content-hash-named files) gets a year-long immutable `Cache-Control` header, and `/` gets a `Link: </assets/entry-xxx.js>; rel=modulepreload` header pointing at the client entry chunk (only Cloudflare consumes it, for Early Hints). Mutually exclusive with shipping your own `_headers` in `public/` (both would produce the same file — pick one). See the [Deployment guide](./deploy.md).

## strictLinks

```ts
strictLinks: 'warn', // 'off' | 'warn' | 'error', default 'warn'
```

Policy for bare relative links: an internal markdown link in content that lacks the `./` `../` prefix (e.g. `guide/a.md`) is neither rewritten to a route nor covered by dead-link checking — it is emitted as-is pointing at `.md`, which is almost always a forgotten prefix.

- `'warn'` (default): lists file, line number, and link at build time; the build still passes
- `'error'`: fails the build like a dead link; suited for strict CI
- `'off'`: no report at all

Only affects build-time reporting; the dev server does not check. Syntax details in [Markdown extensions](./markdown.md#site-links-and-dead-link-checking).

## readingTime

```ts
readingTime: true, // default true
```

Reading-time estimate, computed from the content at build time — Chinese by character count (300 chars/min), English by word count (200 words/min), mixed text merged linearly; frontmatter, code fences, and inline code are excluded. The result goes into the page payload as `page.readingTime` (integer minutes, rounded up, minimum 1), available for display spots such as archive cards; the article top meta row currently does not render it. Set to `false` to drop the field from the payload.

## Build-layer extension fields (AbsolutePressConfig)

- `nav`: see above
- `entryListIslands: string[]`: the list of site islands that reuse the `@@@` entry pipeline (names must already be registered in `islands`) — at build time these islands' children are split into a static table skeleton of "title + meta + body" by the same rules as ExpandableList, and the island client fills data via `childrenHtml`. See [Islands](./islands.md#reusing-the-entry-pipeline-for-site-islands-entrylist)
- `code` / `readingTime`: see above
- `islands` / `lang` / `label`: see above

## Vite layer

Outside `absolutePress()` this is still a standard vite config: `build.target` should be `esnext`; the output directory is controlled by `build.outDir` (this site outputs to `dist`). UnoCSS and `vite-plugin-solid` need explicit wiring; template in [Getting started](./getting-started.md#vite-config-ts).

## Per-page config (frontmatter)

Frontmatter recognizes only six keys: `date` / `category` / `tag` / `icon` / `feed` / `overview`. Semantics in the [Writing guide](./writing.md#the-six-frontmatter-keys). Pages with `feed: false` leave RSS (the article feed still includes them).
