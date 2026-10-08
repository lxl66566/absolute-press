import path from 'node:path';

import type {
  CuratedNavItem,
  DirectoryIndex,
  LocaleInfo,
  MarkdownCodeOptions,
  PageFrontmatter,
  RelatedDepth,
  SiteConfig,
  SocialEntry,
  StrictLinks,
} from '../shared/types.ts';
import { ARCHIVE_PER_PAGE, HOME_FEED_PER_PAGE } from '../shared/types.ts';
import { DEFAULT_RSS_LIMIT } from './build/feeds.ts';
import {
  DEFAULT_MAX_GRAPH_EDGES,
  DEFAULT_MAX_GRAPH_NODES,
  DEFAULT_TWO_HOP_NODE_LIMIT,
} from './build/related.ts';
import { normalizeRouteForMatch } from './build/route-match.ts';
import {
  resolveCodeOptions,
  type ResolvedCodeOptions,
} from './markdown/options.ts';

/**
 * Key of the default locale (content at contentDir root, no route prefix).
 * The key is user-visible: pages of the default locale carry it in their
 * payload as `site.locale` / `page.locale`.
 */
export const DEFAULT_LOCALE_KEY = 'root';

const RELATED_DEPTHS: readonly RelatedDepth[] = [1, 2, 3];

const STRICT_LINKS: readonly StrictLinks[] = ['off', 'warn', 'error'];

const DIRECTORY_INDEX: readonly DirectoryIndex[] = ['slash', 'bare'];

/** Runtime guard for the compile-time `DirectoryIndex` union (JS config files). */
function resolveDirectoryIndex(value: string | undefined): DirectoryIndex {
  if (value === undefined) return 'slash';
  if ((DIRECTORY_INDEX as readonly string[]).includes(value)) {
    return value as DirectoryIndex;
  }
  throw new Error(
    `[absolute-press] urls.directoryIndex must be one of ${DIRECTORY_INDEX.join(', ')}, got '${value}'`,
  );
}

/** Runtime guard for the compile-time `StrictLinks` union (JS config files). */
function resolveStrictLinks(value: string | undefined): StrictLinks {
  if (value === undefined) return 'warn';
  if ((STRICT_LINKS as readonly string[]).includes(value)) {
    return value as StrictLinks;
  }
  throw new Error(
    `[absolute-press] strictLinks must be one of ${STRICT_LINKS.join(', ')}, got '${value}'`,
  );
}

/** Runtime guard for the compile-time `RelatedDepth` union (JS config files). */
function resolveRelatedDepth(value: number | undefined): RelatedDepth {
  if (value === undefined) return 1;
  if (RELATED_DEPTHS.includes(value as RelatedDepth)) {
    return value as RelatedDepth;
  }
  throw new Error(
    `[absolute-press] related.depth must be one of ${RELATED_DEPTHS.join(', ')}, got ${String(value)}`,
  );
}

/** Runtime guard for an integer option with a hard lower bound. */
function resolveIntOption(
  value: number | undefined,
  fallback: number,
  min: number,
  key: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min) {
    throw new Error(
      `[absolute-press] ${key} must be an integer >= ${min}, got ${String(value)}`,
    );
  }
  return value;
}

/**
 * Validate the canonical site URL. A scheme-less `example.com` would silently
 * produce invalid canonical/RSS/sitemap URLs, so require a full http(s) URL.
 * A path segment is the deployment base (project-pages hosting, e.g.
 * `https://user.github.io/repo`) and is kept; trailing slashes are dropped.
 */
function resolveHostname(hostname: string): string {
  const problem = `[absolute-press] hostname must be a full URL with an http(s) scheme, e.g. 'https://example.com' (got '${hostname}')`;
  let parsed: URL;
  try {
    parsed = new URL(hostname);
  } catch {
    throw new Error(problem);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(problem);
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/**
 * User-facing config: SiteConfig plus build-layer extensions.
 * Extensions live here because src/shared/types.ts is architect-owned.
 */
export interface AbsolutePressConfig extends SiteConfig {
  /**
   * Site-data hook: runs once per scan (startup, build, dev resyncs and
   * content edits) with the collected page inventory — normalized and raw
   * frontmatter, creation and git times — before rendering. The return
   * value is JSON-serialized into the `virtual:absolute-press/site-data`
   * module for site islands, so it must be JSON-serializable; a returned
   * promise is awaited.
   */
  onScan?: (ctx: SiteScanContext) => unknown;
  /**
   * Navbar options in one place: exclusions, brand image, per-directory
   * tweaks, top-level order, lane alignment and social buttons.
   */
  nav?: NavConfig;
  /** Sidebar order options over the generated tree. */
  sidebar?: SidebarConfig;
  /** Extra islands: PascalCase tag -> module path relative to project root. */
  islands?: Record<string, string>;
  /**
   * Site islands whose children markdown uses the `@@@` entry-list pipeline
   * (data-backed lists: the build renders the static table skeleton from the
   * `@@@`-split entries, the island fills meta cells client-side from its
   * own data module). Names must be registered in `islands`.
   * @default []
   */
  entryListIslands?: string[];
  /** `<html lang>` of the default locale. @default 'zh-CN' */
  lang?: string;
  /** Default-locale label for the locale switcher. @default '简体中文' */
  label?: string;
  /** Code block presentation defaults (line numbers / folding / wrap). */
  code?: MarkdownCodeOptions;
  /** Estimated reading time in the article meta row. @default true */
  readingTime?: boolean;
  /**
   * Related-articles graph options (site-layer extension of
   * `SiteConfig['related']`, which only pins the depth union).
   */
  related?: {
    /** BFS depth. @default 1 */
    depth?: RelatedDepth;
    /**
     * Per-page node cap of the related graph (the page itself included).
     * Raise together with `maxEdges` on large, densely cross-linked sites.
     * @default 60
     */
    maxNodes?: number;
    /**
     * Per-page cap on member-member edges (unordered pairs).
     * @default 240
     */
    maxEdges?: number;
    /**
     * Hub fallback for multi-hop graphs: when a page's related-node count
     * (the page itself included) exceeds this limit, it renders only its
     * one-hop neighbors instead of `depth` hops, and a one-hop star larger
     * than this limit keeps only its strongest members — the rendered node
     * ceiling of the related graph. The full multi-hop graph around a hub
     * page crowds its canvas labels into an unreadable blob, so dense hubs
     * drop back to the readable star. @default 48
     */
    twoHopNodeLimit?: number;
  };
}

/** Identity helper with defaults applied later in resolveConfig. */
export function defineConfig(config: AbsolutePressConfig): AbsolutePressConfig {
  return config;
}

/** One content page as seen by the site scan, before rendering. */
export interface SiteScanPage {
  /** Absolute path of the markdown source. */
  filePath: string;
  /**
   * Locale-prefixed clean route: leaf `/guide/a`, directory index `/guide/`
   * (`/guide` in bare mode), locale home `/en/`, site home `/`.
   */
  route: string;
  /** Path relative to the locale content root, posix separators. */
  relPath: string;
  /** Locale the page belongs to. */
  locale: LocaleInfo;
  /** Frontmatter normalized to the framework-recognized keys. */
  frontmatter: PageFrontmatter;
  /** Parsed frontmatter as the yaml source gave it; custom keys live here. */
  rawFrontmatter: Record<string, unknown>;
  /** Frontmatter `date` as an ISO string; null when absent or unparsable. */
  createdAt: string | null;
  /** Last git commit time as an ISO string; null when unavailable. */
  updatedAt: string | null;
}

/** Argument of the config `onScan` hook. */
export interface SiteScanContext {
  /** Fully resolved site config. */
  config: ResolvedConfig;
  /** Every scanned content page, all locales, in config locale order. */
  pages: SiteScanPage[];
}

/**
 * Navbar options gathered under one `nav` section instead of scattered
 * top-level keys. The navbar tree is generated from the content
 * directories; these knobs only shape the generated result.
 */
export interface NavConfig {
  /**
   * Route prefixes excluded from navbar/sidebar (pages are still built).
   * "Exists but not in nav" mechanism; frontmatter has no hide key in the
   * shared contract, so hiding is a site-config concern.
   */
  exclude?: string[];
  /**
   * Brand image shown in the navbar (and the mobile drawer footer),
   * resolved against the site public root: '/logo.jpg' -> public/logo.jpg.
   */
  logo?: string;
  /**
   * Navbar display tweaks keyed by top-level content directory name. They
   * decouple nav wording from directory names and lay out one dropdown
   * panel in titled groups without touching the content tree (URLs keep
   * their directory names).
   */
  tweaks?: Record<string, NavbarDirTweak>;
  /**
   * Top-level navbar order by content directory name (tweaks are keyed
   * the same way). Unknown names are skipped; unlisted directories and
   * loose root pages keep their generated order.
   */
  order?: string[];
  /** Horizontal alignment of the top-level navbar lane. @default 'left' */
  align?: NavAlign;
  /** Navbar social icon buttons, rendered before the RSS button. */
  social?: SocialEntry[];
}

/**
 * Display tweaks for one top-level directory's navbar entry.
 * Item paths are extension-less and relative to the directory
 * ('galgame' -> `<dir>/galgame.md`, 'other_games' -> the subdirectory).
 */
export interface NavbarDirTweak {
  /** Nav text decoupled from the directory name (and its index title). */
  label?: string;
  /**
   * Dropdown layout: optional group captions with member lists. Captioned
   * groups render as non-interactive headers with their children inlined;
   * caption-less groups only reorder. Unlisted members are appended after
   * the groups, so nothing silently disappears.
   */
  groups?: { text?: string; items: string[] }[];
  /**
   * Verbatim curated panel children (e.g. sections derived from a site data
   * module). Internal links are validated against the directory's pages at
   * build time; generated members no curated link covers keep their
   * generated slot after the items. Takes precedence over `groups`.
   */
  items?: CuratedNavItem[];
}

/** Horizontal alignment of the top-level navbar lane. */
export type NavAlign = 'left' | 'center';

/**
 * Sidebar order options. The sidebar tree is generated complete from the
 * content directories; these knobs only reorder the generated result —
 * entries can be rearranged, never dropped (hiding pages is `nav.exclude`).
 */
export interface SidebarConfig {
  /**
   * Top-level sidebar order by content directory name (same semantics as
   * `nav.order`): listed directories first in config order, unknown names
   * skipped, the rest appended in generated order.
   */
  order?: string[];
  /**
   * Member order inside one directory, keyed by the directory's path from
   * the content root (a top-level directory is its bare name, nested
   * directories join segments with '/', e.g. 'guide/advanced'). Member
   * names are extension-less and relative to that directory: the page stem
   * or the subdirectory name. Listed members first in config order,
   * unknown names skipped, the rest keep their generated order — an order
   * list reorders, it can never make an entry disappear.
   */
  tweaks?: Record<string, string[]>;
}

/** Normalized navbar options consumed by the build layer. */
export interface ResolvedNav {
  /** Match-normalized route prefixes: decoded, leading '/', no trailing '/'. */
  exclude: string[];
  /** Top-level navbar directory order, config order preserved. */
  order: string[];
  /** Horizontal alignment of the top-level navbar lane. */
  align: NavAlign;
  /** Brand image path resolved against the site public root. */
  logo?: string;
  /** Navbar display tweaks keyed by top-level directory name. */
  tweaks?: Record<string, NavbarDirTweak>;
  /** Navbar social icon buttons, rendered before the RSS button. */
  social?: SocialEntry[];
}

/** Fully normalized config consumed by the build layer. */
export interface ResolvedConfig {
  /** Vite project root (absolute). */
  root: string;
  /** Vite public dir (absolute; null when disabled via vite `publicDir: false`). */
  publicDir: string | null;
  /** Content root of the default locale (absolute). */
  contentDir: string;
  title: string;
  description: string;
  /** Canonical site URL without trailing slash. */
  hostname: string;
  /** Site favicon in the public root; absent when unconfigured or blank. */
  favicon?: string;
  /** Default locale first; its `prefix` is ''. */
  locales: LocaleInfo[];
  /** Normalized navbar options. */
  nav: ResolvedNav;
  /** Normalized sidebar order options. */
  sidebar: {
    /** Top-level sidebar directory order, config order preserved. */
    order: string[];
    /** Per-directory member order keyed by content-root-relative dir path. */
    tweaks: Record<string, string[]>;
  };
  /** Island tag -> absolute module path. */
  islands: Record<string, string>;
  /** Site islands opted into the `@@@` entry-list children pipeline. */
  entryListIslands: string[];
  /** Normalized code block options. */
  code: ResolvedCodeOptions;
  /** Estimated reading time in the article meta row. */
  readingTime: boolean;
  /** Home page options (article feed on/off, feed page size). */
  home: Required<NonNullable<SiteConfig['home']>>;
  /** Category/tag archive page options. */
  archive: Required<NonNullable<SiteConfig['archive']>>;
  /** Canonical URL shapes. */
  urls: { directoryIndex: DirectoryIndex };
  /** RSS feed options. */
  feed: Required<NonNullable<SiteConfig['feed']>>;
  /** SEO head options (share-card image, JSON-LD author). */
  seo?: NonNullable<SiteConfig['seo']>;
  /** Policy for bare relative markdown links. */
  strictLinks: StrictLinks;
  /** Custom footer credit line; absent keeps the default credits. */
  footer?: NonNullable<SiteConfig['footer']>;
  /** Related-articles graph options. */
  related: {
    depth: RelatedDepth;
    maxNodes: number;
    maxEdges: number;
    twoHopNodeLimit: number;
  };
  /** Site integrations passed through from SiteConfig. */
  algolia?: SiteConfig['algolia'];
  giscus?: SiteConfig['giscus'];
  encrypt?: SiteConfig['encrypt'];
  googleAnalytics?: string;
  /** Registered icon map (empty when unconfigured). */
  icons: Record<string, string>;
}

/**
 * Normalize SEO head options: blank values would render empty tags
 * (an empty og:image, a name-less JSON-LD author), so treat them as unset;
 * with nothing usable left the whole section drops out.
 */
function resolveSeo(seo: SiteConfig['seo']): ResolvedConfig['seo'] | undefined {
  const image = seo?.image?.trim() ? seo.image : undefined;
  const author = seo?.author?.name.trim() ? seo.author : undefined;
  const exclude = (seo?.exclude ?? []).map(normalizeRouteForMatch);
  if (!image && !author && exclude.length === 0) return undefined;
  return {
    ...(image ? { image } : {}),
    ...(author ? { author } : {}),
    ...(exclude.length > 0 ? { exclude } : {}),
  };
}

export function resolveConfig(
  config: AbsolutePressConfig,
  root: string,
  /** Vite public dir; false = disabled. Defaults to `<root>/public` (vite's default). */
  publicDir: string | false = path.join(root, 'public'),
): ResolvedConfig {
  const locales: LocaleInfo[] = [
    {
      key: DEFAULT_LOCALE_KEY,
      lang: config.lang ?? 'zh-CN',
      label: config.label ?? '简体中文',
      prefix: '',
    },
    ...Object.entries(config.locales ?? {}).map(([key, lc]) => ({
      key,
      lang: lc.lang,
      label: lc.label,
      prefix: `/${key}`,
    })),
  ];
  const code: ResolvedCodeOptions = resolveCodeOptions(config.code);
  const related = {
    depth: resolveRelatedDepth(config.related?.depth),
    maxNodes: resolveIntOption(
      config.related?.maxNodes,
      DEFAULT_MAX_GRAPH_NODES,
      2,
      'related.maxNodes',
    ),
    maxEdges: resolveIntOption(
      config.related?.maxEdges,
      DEFAULT_MAX_GRAPH_EDGES,
      1,
      'related.maxEdges',
    ),
    twoHopNodeLimit: resolveIntOption(
      config.related?.twoHopNodeLimit,
      DEFAULT_TWO_HOP_NODE_LIMIT,
      2,
      'related.twoHopNodeLimit',
    ),
  };
  // Related options flow explicitly into the aggregation (SiteStore passes
  // config.related to buildRelatedMap), like the code options above — no
  // module-level ambient channel.
  const nav: ResolvedNav = {
    exclude: (config.nav?.exclude ?? []).map(normalizeRouteForMatch),
    order: config.nav?.order ?? [],
    align: config.nav?.align ?? 'left',
    ...(config.nav?.logo ? { logo: config.nav.logo } : {}),
    ...(config.nav?.tweaks ? { tweaks: config.nav.tweaks } : {}),
    ...(config.nav?.social?.length ? { social: config.nav.social } : {}),
  };
  const sidebar = {
    order: config.sidebar?.order ?? [],
    tweaks: config.sidebar?.tweaks ?? {},
  };
  return {
    root,
    publicDir: publicDir || null,
    contentDir: path.resolve(root, config.contentDir),
    title: config.title,
    description: config.description,
    hostname: resolveHostname(config.hostname),
    // A blank favicon would emit an empty icon link; treat it as unset.
    ...(config.favicon?.trim() ? { favicon: config.favicon } : {}),
    locales,
    nav,
    sidebar,
    islands: Object.fromEntries(
      Object.entries(config.islands ?? {}).map(([tag, mod]) => [
        tag,
        path.resolve(root, mod),
      ]),
    ),
    entryListIslands: config.entryListIslands ?? [],
    code,
    readingTime: config.readingTime ?? true,
    home: {
      feed: config.home?.feed ?? true,
      feedPerPage: resolveIntOption(
        config.home?.feedPerPage,
        HOME_FEED_PER_PAGE,
        1,
        'home.feedPerPage',
      ),
    },
    archive: {
      perPage: resolveIntOption(
        config.archive?.perPage,
        ARCHIVE_PER_PAGE,
        1,
        'archive.perPage',
      ),
    },
    urls: {
      directoryIndex: resolveDirectoryIndex(config.urls?.directoryIndex),
    },
    feed: {
      rssLimit: resolveIntOption(
        config.feed?.rssLimit,
        DEFAULT_RSS_LIMIT,
        1,
        'feed.rssLimit',
      ),
    },
    seo: resolveSeo(config.seo),
    strictLinks: resolveStrictLinks(config.strictLinks),
    // A blank credit would render an empty footer line; treat it as unset.
    ...(config.footer?.credit?.trim() ? { footer: config.footer } : {}),
    related,
    ...(config.algolia ? { algolia: config.algolia } : {}),
    ...(config.giscus ? { giscus: config.giscus } : {}),
    ...(config.encrypt ? { encrypt: config.encrypt } : {}),
    ...(config.googleAnalytics
      ? { googleAnalytics: config.googleAnalytics }
      : {}),
    icons: config.icons ?? {},
  };
}
