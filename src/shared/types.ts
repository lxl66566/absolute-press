/**
 * Data contracts shared between build-time (node) and client runtime.
 * Single source of truth — changes require architect approval.
 */
import type { BuiltinBuildComponentName } from './components.ts';

/** Frontmatter keys actually used by the framework. */
export interface PageFrontmatter {
  /** Creation date (ISO string or `yyyy-MM-dd`). */
  date?: string;
  category?: string[];
  tag?: string[];
  /** Key into the site config `icons` map. */
  icon?: string;
  /** Default true; false excludes the page from RSS. */
  feed?: boolean;
  /**
   * Default true; false keeps a folder index page out of the navbar overview
   * row (no panel row, no client-synthesized one). It stays the folder row's
   * link target and a sidebar member.
   */
  overview?: boolean;
}

export interface Heading {
  level: number;
  /** Plain text without inline HTML. */
  text: string;
  /**
   * Anchor id from the ported @mdit-vue/shared slugify (VuePress 2): NFKD,
   * combining marks and control chars stripped, special-char runs collapsed
   * to one `-`, leading/trailing `-` stripped, leading digit prefixed `_`,
   * lowercased; CJK preserved. Must match VuePress exactly.
   */
  slug: string;
}

/** One cross-locale counterpart of a page (hreflang alternate). */
export interface PageAlternate {
  /** BCP-47 tag of the counterpart's locale (`LocaleInfo.lang`). */
  lang: string;
  /** Route of the counterpart page (origin-independent). */
  route: string;
}

/** One page's metadata, serialized into the page payload. */
export interface PageMeta {
  /** Locale-prefixed clean route: leaf `/coding/foo`, directory index
   * `/coding/` (`/coding` when `urls.directoryIndex` is 'bare'), home `/`. */
  route: string;
  locale: string;
  /** From first h1; empty string if absent. */
  title: string;
  headings: Heading[];
  frontmatter: PageFrontmatter;
  /** From frontmatter `date`. */
  createdAt: string | null;
  /** From git last-commit time; null when unavailable. */
  updatedAt: string | null;
  /** Estimated reading time in whole minutes; absent when the site disables it. */
  readingTime?: number;
  /**
   * Plain-text excerpt of the rendered content (about META_EXCERPT_LIMIT
   * characters), driving the head meta/og description and its
   * soft-navigation sync. Absent when the page has no extractable text;
   * consumers fall back to `site.description`.
   */
  excerpt?: string;
  /**
   * Cross-locale counterparts of this page, in config locale order — the
   * first entry doubles as the hreflang x-default target. Every entry is
   * existence-checked at build time; absent when fewer than two locales
   * carry the page.
   */
  alternates?: PageAlternate[];
}

/** Lightweight article entry for home feed / archives. */
export interface ArticleInfo {
  route: string;
  title: string;
  icon?: string;
  createdAt: string | null;
  updatedAt: string | null;
  category: string[];
  tag: string[];
}

/**
 * One navbar entry. `kind` discriminates the three renderable shapes so
 * client rendering can switch exhaustively; free-form combinations (a
 * header with a link, a leaf with children) are no longer representable.
 */
export type NavItem =
  | {
      kind: 'leaf';
      text: string;
      /** Page route or external href. */
      link: string;
      icon?: string;
      /**
       * Folder-overview row (板块总览行): marks the generated panel row of a
       * folder's index page, and is honored on curated tweak items too. The
       * client tags the row with `ap-nav-index-row`; presentation (badge,
       * divider) is site CSS.
       */
      index?: boolean;
    }
  | {
      kind: 'folder';
      text: string;
      /**
       * Route of the folder's own index page (板块名即总览, same contract as
       * the sidebar group row); absent for index-less folders, which render
       * a plain toggle row.
       */
      link?: string;
      icon?: string;
      children: NavItem[];
      /**
       * False when the folder's index page opted out of the overview row
       * (frontmatter `overview: false`): the build skips the generated panel
       * row and the client must not synthesize one. Absent = opted in.
       */
      overview?: boolean;
    }
  | {
      /**
       * Caption-only group header (navbar group config): rendered as a
       * non-interactive label with its children inlined below it, instead of
       * a hover flyout row. Plain index-less folders stay flyout rows.
       */
      kind: 'header';
      text: string;
      children: NavItem[];
    };

/** Narrowing helper: link of one nav entry; headers carry none. */
export function navLinkOf(item: NavItem): string | undefined {
  return item.kind === 'header' ? undefined : item.link;
}

/**
 * Site-config curated navbar entry (tweak `items`). Deliberately looser
 * than the payload `NavItem`: no `kind` — the build normalizes these into
 * the union (children make a folder, a link makes a leaf), keeping the
 * payload discriminator out of site configs. `index` marks the folder
 * overview row and is honored on leaves.
 */
export interface CuratedNavItem {
  text: string;
  /** Page route or external href; required for childless entries. */
  link?: string;
  icon?: string;
  index?: boolean;
  children?: CuratedNavItem[];
}

/** One navbar social icon button. */
export interface SocialEntry {
  /** Key into config `icons`, or a built-in brand key (github/telegram/bilibili). */
  icon: string;
  /** Absolute URL; always opened in a new tab. */
  url: string;
  /** aria-label and hover title. */
  title: string;
}

export type SidebarItem =
  | { kind: 'link'; text: string; link: string; icon?: string }
  | {
      kind: 'group';
      text: string;
      /**
       * Route of the folder's own index.md; the folder row navigates there
       * (client renders the row as a link and hands collapsing to a separate
       * chevron). Absent for folders without an index.md. The index page
       * itself does NOT repeat as a child item.
       */
      link?: string;
      /** Inherited from the folder index's frontmatter icon, when present. */
      icon?: string;
      children: SidebarItem[];
      collapsible?: boolean;
    };

export interface LocaleInfo {
  /** Config key, e.g. `zh`, `en`. Default locale has empty route prefix. */
  key: string;
  /** `<html lang>` value, e.g. `zh-CN`. */
  lang: string;
  label: string;
  /** Route prefix, '' for default locale, '/en' etc otherwise. */
  prefix: string;
}

/** Reference edge between two of a page's related articles. */
export interface RelatedEdgeRef {
  /** Route of the other neighbor. */
  route: string;
  /** Mutual reference count between the two neighbors. */
  refs: number;
}

/** Article-reference graph edge for the related-articles component. */
export interface RelatedLink {
  route: string;
  title: string;
  /** Mutual reference count; drives edge thickness. */
  refs: number;
  /**
   * Optional induced-subgraph edges: this neighbor's mutual references to
   * the page's other neighbors. Lets the client draw neighbor-neighbor
   * edges without extra payload fields; each unordered pair is listed on
   * both endpoints. Omitted when the page's neighbors are not
   * interconnected (or the per-page edge cap dropped every pair).
   */
  links?: RelatedEdgeRef[];
}

/** Everything serialized into `<script id="__AP_DATA__">` of one page. */
export interface PagePayload {
  site: {
    title: string;
    description: string;
    /** Per-page relative base prefix: '' at root, '../' one level deep. */
    base: string;
    locales: LocaleInfo[];
    locale: string;
    /**
     * Present only when the top-level navbar lane is centered
     * (config `nav.align: 'center'`); absent keeps the left-aligned lane.
     */
    navAlign?: 'center';
    /**
     * Present only when the home feed page size is non-default
     * (config `home.feedPerPage`); absent keeps HOME_FEED_PER_PAGE.
     */
    feedPerPage?: number;
    /**
     * Present only when the archive page size is non-default
     * (config `archive.perPage`); absent keeps ARCHIVE_PER_PAGE.
     */
    archivePerPage?: number;
    /**
     * Present only when the footer credit line is customized
     * (config `footer.credit`); absent keeps the default credits.
     */
    footerCredit?: string;
    /** Site-registered icons referenced by pages in this payload (subset of config `icons`). */
    icons?: Record<string, string>;
    /** Brand image for the navbar/drawer, resolved against the page base. */
    logo?: string;
    /** Present when Algolia DocSearch is configured. */
    algolia?: { appId: string; apiKey: string; indexName: string };
    /** Present when navbar social links are configured. */
    social?: SocialEntry[];
  };
  navbar: NavItem[];
  /** Sidebar section resolved for this page. */
  sidebar: SidebarItem[];
  page: PageMeta;
  /** Present only on home / archive pages. */
  articles?: ArticleInfo[];
  related?: RelatedLink[];
  encrypted?: {
    /** sha256 hex of the accepted passwords. */ hashes: string[];
    hint?: string;
  };
}

// ---------------------------------------------------------------------------
// Site config (user-facing)
// ---------------------------------------------------------------------------

export interface LocaleConfig {
  /** `<html lang>` value. */
  lang: string;
  /** Shown in locale switcher. */
  label: string;
}

/** Default articles per page of the home feed; the payload omits the default. */
export const HOME_FEED_PER_PAGE = 3;

/**
 * Default articles per page of one category/tag archive; the payload omits
 * the default.
 */
export const ARCHIVE_PER_PAGE = 10;

export interface SiteConfig {
  /** Content root for the default locale, relative to project root. */
  contentDir: string;
  title: string;
  description: string;
  /** Canonical site URL (origin + optional base path) for SEO/sitemap/RSS, e.g. `https://user.github.io/repo`. */
  hostname: string;
  /**
   * Built-in build component options. Build components are markdown tags
   * rendered to final static HTML at build time (no client JS) — the
   * inventory lives in shared/components.ts and the guide's build-component
   * section.
   */
  buildComponents?: {
    /**
     * Built-in build components disabled by tag name: a disabled tag in
     * markdown renders nothing and warns at build time. Unknown names fail
     * config resolution with the list of available components.
     */
    disable?: BuiltinBuildComponentName[];
  };
  /**
   * Site favicon in the public root (same resolution as `nav.logo`):
   * '/favicon.svg' -> public/favicon.svg. The shell emits one
   * `<link rel="icon">` with the MIME type derived from the extension
   * (ico/png/svg/webp; other extensions ship without `type`).
   */
  favicon?: string;
  /** Extra locales; content lives in `<contentDir>/<key>/`. */
  locales?: Record<string, LocaleConfig>;
  /**
   * Explicitly registered icons; frontmatter `icon` must be a key here.
   * Values are either a complete `<svg>...</svg>` string or bare SVG inner
   * markup (e.g. `<path .../>`), which the client wraps in a 24x24 svg.
   */
  icons?: Record<string, string>;
  /** Client-side password gates, matched against page routes. */
  encrypt?: { match: RegExp | string; passwords: string[]; hint?: string }[];
  /** Home page options. */
  home?: {
    /**
     * Render the paginated article feed above locale home pages.
     * Docs/landing home pages turn this off so the prose intro stays the
     * visual primary. @default true
     */
    feed?: boolean;
    /**
     * Articles per page of the home article feed (client-side pagination
     * over the payload articles). @default HOME_FEED_PER_PAGE
     */
    feedPerPage?: number;
  };
  /** Category/tag archive page options. */
  archive?: {
    /**
     * Articles per page of one archive page (client-side pagination).
     * @default ARCHIVE_PER_PAGE
     */
    perPage?: number;
  };
  /** RSS feed options. */
  feed?: {
    /**
     * Newest articles (across locales, `feed: false` excluded) included in
     * `rss.xml`. @default 20
     */
    rssLimit?: number;
  };
  /** SEO head options. */
  seo?: {
    /**
     * Share-card image for `og:image` / `twitter:card`. Relative values
     * resolve against the site public root (like `nav.logo`); absolute
     * http(s) URLs pass through. Unset sites emit `twitter:card: summary`
     * (a card without image) and no `og:image`.
     */
    image?: string;
    /**
     * Author of the BlogPosting JSON-LD on article pages. Unset sites emit
     * no `author`; a blank name counts as unset.
     */
    author?: {
      name: string;
      /** Author profile URL; becomes the schema.org `url`. */
      url?: string;
    };
    /**
     * Route prefixes that must stay uncrawled: excluded from sitemap.xml
     * and disallowed in robots.txt (e.g. `['/hide']`). For password-gated
     * pages prefer `encrypt` — it excludes from the sitemap and disallows
     * on its own, and also gates the content.
     */
    exclude?: string[];
  };
  /**
   * Footer options. The footer is one quiet line: the desktop footer under
   * the content column and the mobile drawer footer.
   */
  footer?: {
    /**
     * Credit line text. Default is the CC glyph + the framework name; a
     * custom value replaces the whole line (plain text).
     */
    credit?: string;
  };
  /**
   * Canonical URL shapes. Emitted file names never change (a page always
   * ships as an `.html` file); these options only pick which URL form the
   * canonical/og/sitemap/RSS links and the client router use.
   */
  urls?: {
    /**
     * Canonical route of a directory index page (`guide/index.md`):
     * 'slash' -> `/guide/` (GitHub Pages native), 'bare' -> `/guide`
     * (Cloudflare Pages native). The other form always costs one host
     * redirect; there is no shape both platforms serve without one.
     * @default 'slash'
     */
    directoryIndex?: DirectoryIndex;
  };
  /**
   * Policy for bare relative markdown links (no `./` `../` prefix, e.g.
   * `guide/a.md`): they are never rewritten to a route and skip the
   * dead-link check. `warn` reports them at build (the build passes),
   * `error` fails the build, `off` is silent. Build-time only.
   * @default 'warn'
   */
  strictLinks?: StrictLinks;
  algolia?: { appId: string; apiKey: string; indexName: string };
  giscus?: {
    repo: string;
    repoId: string;
    category: string;
    categoryId: string;
  };
  googleAnalytics?: string;
  /** Related-articles graph options. */
  related?: {
    /**
     * BFS depth of the article-reference graph: 1 = direct neighbors plus
     * their induced edges (default), N = every article within N hops plus
     * the real edges among them. Bounded node/edge caps apply regardless.
     */
    depth?: RelatedDepth;
  };
}

/** Policy for bare relative markdown links (see `SiteConfig.strictLinks`). */
export type StrictLinks = 'off' | 'warn' | 'error';

/** Canonical form of directory-index routes (see `SiteConfig.urls`). */
export type DirectoryIndex = 'slash' | 'bare';

/** Allowed related-graph BFS depths; larger values explode the payload. */
export type RelatedDepth = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Markdown renderer contract (src/node/markdown)
// ---------------------------------------------------------------------------

export interface CollectedLink {
  /** Raw href as written in markdown. */
  raw: string;
  /** Resolved route for internal links; raw value for external. */
  resolved: string;
  kind: 'internal' | 'external' | 'anchor';
  /** Internal link failed to resolve (only for `./` `../` relative links). */
  dead: boolean;
  /**
   * Bare relative link (no `./` `../` prefix and not site-absolute): passed
   * through unrewritten and outside the dead-link check; reported per the
   * site `strictLinks` policy. Always `kind: 'external'` — the raw value is
   * not a route, so consumers (related graph, feed) must not resolve it.
   */
  bare?: boolean;
  /**
   * 1-based source line of the link's block, for dead-link reports.
   * Approximate: links inside a multi-line block report the block start
   * (inline tokens carry no position). Absent for links inside island
   * inner markdown — fragment-relative lines would mislead.
   */
  line?: number;
}

export interface RenderResult {
  html: string;
  /** First h1 plain text; null when absent. */
  title: string | null;
  headings: Heading[];
  frontmatter: PageFrontmatter;
  links: CollectedLink[];
  /** Estimated reading time in whole minutes (see node/markdown/reading-time.ts). */
  readingTime: number;
}

export interface MarkdownEnv {
  /** Absolute path of the source file, for relative resolution. */
  filePath: string;
  /**
   * `<html lang>` of the locale the file belongs to; omitted renders the
   * default-locale copy (heimu tooltip resolves UI copy by lang prefix).
   */
  lang?: string;
}

/** Island registration for the markdown renderer (tag names must be PascalCase). */
export interface MarkdownIsland {
  /** PascalCase tag usable in markdown. */
  name: string;
  /**
   * Children markdown uses the `@@@` entry-list pipeline: the build splits
   * the children into titled entries and renders the static table skeleton
   * (title cells + full-width body rows, no meta cells — a data-backed island
   * fills those client-side). Site islands opt in via config
   * `entryListIslands`.
   */
  entryList?: boolean;
}

/** Site-level defaults for code block presentation (markdown pipeline). */
export interface MarkdownCodeOptions {
  /** Line-number gutter on every code fence. @default true */
  lineNumbers?: boolean;
  /**
   * Blocks longer than this many lines render collapsed behind a no-JS
   * expander; `null` disables collapsing entirely. @default 15
   */
  collapsedLines?: number | null;
  /** Soft-wrap long lines instead of horizontal scrolling. @default true */
  wrap?: boolean;
  /**
   * Accessible label of the code-block copy button (aria-label + title).
   * The zh default keeps the framework's zh-first posture; English sites
   * override via site config. @default '复制代码'
   */
  copyLabel?: string;
}

export interface MarkdownOptions {
  /** Resolve an internal `.md` link to a page-relative href; null = dead link. */
  resolveLink?: (href: string, env: MarkdownEnv) => string | null;
  /** Rewrite a relative image src (build layer copies the asset). */
  resolveImage?: (src: string, env: MarkdownEnv) => string;
  /** Islands whose tags may appear in markdown. */
  islands?: MarkdownIsland[];
  /**
   * Build component tag names recognized by the markdown extraction. These
   * tags render as transient markers that the build layer swaps for final
   * static HTML after the render (see src/node/build/components.ts).
   */
  buildComponents?: ReadonlySet<string>;
  /** Code block presentation defaults. */
  code?: MarkdownCodeOptions;
}

export interface MarkdownRenderer {
  render: (src: string, env: MarkdownEnv) => RenderResult;
}
