import fs from 'node:fs';
import path from 'node:path';

import { BUILD_COMPONENT_NAMES } from '../../shared/components.ts';
import { BUILTIN_ISLAND_NAMES } from '../../shared/islands.ts';
import { seoPageType } from '../../shared/seo.ts';
import type {
  ArticleInfo,
  LocaleInfo,
  PageAlternate,
  PageMeta,
  PagePayload,
  RelatedLink,
  TermHooks,
} from '../../shared/types.ts';
import { ARCHIVE_PER_PAGE, HOME_FEED_PER_PAGE } from '../../shared/types.ts';
import type { MarkdownRenderer, RenderResult } from '../../shared/types.ts';
import type { ResolvedConfig } from '../config.ts';
import type { SiteScanContext } from '../config.ts';
import { escapeHtml } from '../escape.ts';
import { META_EXCERPT_LIMIT, plainExcerpt } from '../excerpt.ts';
import { localImageSize } from '../image-size.ts';
import {
  assertNoArchiveCollisions,
  groupArchiveArticles,
  type ArchivePage,
} from './archive.ts';
import {
  LinkResolver,
  bareLinkReport,
  deadLinkReport,
  devFsUrl,
} from './assets.ts';
import type { DeadLink } from './assets.ts';
import { clientEntry } from './clientEntry.ts';
import {
  BUILD_COMPONENT_RENDERERS,
  type BuildComponentContext,
} from './components.ts';
import { renderCloudflareHeaders } from './deploy.ts';
import { encryptRuleFor } from './encrypt.ts';
import { renderRobots, renderRss, renderSitemap } from './feeds.ts';
import type { FeedArticle, SitemapEntry } from './feeds.ts';
import { getGitTimes } from './git.ts';
import { katexAssets, katexDevHref, pageUsesKatex } from './katex-assets.ts';
import { createMarkdownRenderer } from './markdown-adapter.ts';
import { buildChrome } from './nav-tree.ts';
import { isNotFoundRoute, renderNotFound } from './not-found.ts';
import {
  buildArticles,
  INDEX_STEMS,
  isLocaleHome,
  isNavExcluded,
  routeToFileName,
  stemOf,
} from './pages.ts';
import type { PageSource, RenderedPage } from './pages.ts';
import {
  isRefFile,
  localeContentRoot,
  localeKeyOf,
  lookupRef,
  refTitle,
  scanRefEntry,
  scanRefs,
  type RefsScan,
  type ScannedRef,
} from './refs.ts';
import { buildRelatedMap } from './related.ts';
import {
  createdAtOf,
  scanFile,
  scanSite,
  siteScanContext,
  type ScannedFile,
  type SiteScan,
} from './scan.ts';
import { baseOf, renderShell, type ShellInput } from './shell.ts';

interface RenderedEntry {
  mtimeMs: number;
  result: RenderResult;
  /**
   * Head/RSS excerpt source, cached with the render: deriving it per emit
   * or dev request would re-scan every page's full html on each pass.
   */
  excerpt: string;
}

/** RenderedPage plus the raw render html, used by content decoration. */
interface EmittedPage extends RenderedPage {
  html: string;
}

/** Navbar/sidebar/article list shared by every payload of one locale. */
interface LocaleChrome {
  navbar: PagePayload['navbar'];
  sidebar: PagePayload['sidebar'];
  articles: ArticleInfo[];
}

/** relPath -> (locale key -> page source), over the full scan. */
function siblingIndex(
  pages: PageSource[],
): Map<string, Map<string, PageSource>> {
  const index = new Map<string, Map<string, PageSource>>();
  for (const p of pages) {
    let group = index.get(p.relPath);
    if (!group) {
      group = new Map();
      index.set(p.relPath, group);
    }
    group.set(p.locale.key, p);
  }
  return index;
}

/**
 * Alternates of one `<locale key -> entry>` group, config locale order
 * (default first); undefined when fewer than two locales carry it.
 */
function alternatesIn<T>(
  config: ResolvedConfig,
  group: Map<string, T>,
  alternateOf: (entry: T) => PageAlternate,
): PageAlternate[] | undefined {
  const out: PageAlternate[] = [];
  for (const locale of config.locales) {
    const found = group.get(locale.key);
    if (found) out.push(alternateOf(found));
  }
  return out.length > 1 ? out : undefined;
}

/**
 * Render state shared by one dev request or one build emit: every page is
 * rendered at most once, then reused. Per-locale chrome is filled lazily so
 * a dev request touching one locale skips the others.
 */
interface RenderContext {
  pages: EmittedPage[];
  byRoute: Map<string, EmittedPage>;
  /** locale key -> chrome; filled on demand via chromeOf(). */
  chrome: Map<string, LocaleChrome>;
  /** relPath -> locale key -> page; hreflang counterpart lookup. */
  siblings: Map<string, Map<string, PageSource>>;
  /** Archive key `<kind>/<name>` -> alternates; lazy like the chrome. */
  archiveAlternates: Map<string, PageAlternate[]> | null;
  integrations: Pick<
    PagePayload['site'],
    'icons' | 'algolia' | 'social' | 'logo'
  >;
}

export interface BuildAssets {
  /** Dev pages serve the framework entry directly; only the build pipeline
   * passes an emitted chunk. Drives the shell's dev/build branches. */
  isBuild: boolean;
  /** Client entry chunk file name, e.g. 'assets/entry-a1b2.js'. */
  scriptFile: string;
  /** Stylesheet asset file names from the client bundle. */
  cssFiles: string[];
}

export interface EmittedFile {
  fileName: string;
  source: string | Buffer;
}

// Hides gated prose pre-hydration; the PasswordGate island renders its own UI
// as `.ap-gate`, so only non-island children (the raw content) stay hidden.
const GATE_STYLE =
  '<style>[data-ap-island="PasswordGate"]>:not(.ap-gate){display:none}</style>';

// Transient build component marker (markdown/islands.ts emits it after the
// md render; the props value is URI-encoded so it never holds a raw quote).
const BUILD_MARKER_RE =
  /<div data-ap-build="(\w+)" data-props="([^"]*)"><\/div>/g;

/**
 * Owns the whole site state: scan -> render (cached) -> nav/sidebar/payload
 * -> shell HTML. Shared by the dev middleware and the build emitter.
 */
export class SiteStore {
  private pages: PageSource[] = [];
  /** Latest site scan: page sources plus the single-read file cache. */
  private scan: SiteScan = { sources: [], files: new Map() };
  /** Config onScan hook, absent when unconfigured. */
  private readonly onScan?: (ctx: SiteScanContext) => unknown;
  /** Latest onScan hook result; undefined while no hook is configured. */
  private siteDataValue: unknown;
  private rendered = new Map<string, RenderedEntry>();
  /** Term-refs scan (null when the site configures no refs directory). */
  private refs: RefsScan | null = null;
  /** Ref renders keyed `<locale>/<id>`; freshness mirrors `rendered`. */
  private refRendered = new Map<string, { mtimeMs: number; html: string }>();
  // Sync-time "refs directory missing" notice fires once per process; a
  // per-id follow-up would only repeat it (see termHooks.onMiss).
  private refsMissingWarned = false;
  private gitTimes = new Map<string, string>();
  private relatedCache: Map<string, RelatedLink[]> | null = null;
  private renderer: MarkdownRenderer | null = null;
  private rendererPromise: Promise<MarkdownRenderer> | null = null;
  /** Language set the current/pending renderer was created with; the
   * memoization key of ensureRenderer(). */
  private rendererLangs: ReadonlySet<string> = new Set();
  /** An invalidating edit introduced languages outside rendererLangs; the
   * dev middleware refreshes before serving (see refreshRenderer). */
  private langsDirty = false;
  readonly links: LinkResolver;
  // Explicit field instead of a constructor parameter property: this module
  // loads through plain node ESM type-stripping when imported as 'absolute-press'
  // (vite config loading), which rejects non-erasable syntax.
  private readonly config: ResolvedConfig;
  // Dev trusts the watcher's invalidate()/resync() as the sole freshness
  // mechanism (see renderPage); build compares render cache entries against
  // the scan's mtime snapshot. Set by sync(), like LinkResolver.setMode.
  private trustWatcher = false;
  // Last dev archive-collision warning; identical lists stay silent across
  // resyncs (see warnArchiveCollisions).
  private lastCollisionWarn: string | null = null;
  // Dev per-page warnings already emitted (see warnDevPageIssues); reset by
  // sync() alongside the resolver's fresh dead-link record round.
  private devWarned = new Set<string>();

  constructor(
    config: ResolvedConfig,
    onScan?: (ctx: SiteScanContext) => unknown,
  ) {
    this.config = config;
    this.onScan = onScan;
    this.links = new LinkResolver('build');
  }

  /**
   * Shiki's default cold-start loads every bundled grammar (measured ~2s);
   * the site only needs the languages its fences actually use, so the
   * scanned set is passed explicitly and the renderer is memoized per set —
   * a resync that changes the languages rebuilds, everything else reuses
   * the live instance. The language set comes from the scan cache — part
   * of its single read per file, no extra disk pass.
   */
  private async ensureRenderer(): Promise<MarkdownRenderer> {
    const langs = new Set(this.scannedLangs());
    if (
      this.rendererPromise !== null &&
      this.rendererLangs.size === langs.size &&
      [...langs].every(l => this.rendererLangs.has(l))
    ) {
      return this.rendererPromise;
    }
    this.rendererLangs = langs;
    const promise = createMarkdownRenderer({
      resolveLink: this.links.resolveLink,
      resolveImage: this.links.resolveImage,
      // Build-time intrinsic sizes: local images render CLS-safe with
      // width/height attributes (see image-size.ts).
      imageSize: localImageSize,
      // The [[id]] term syntax resolves against the refs scan; the hooks
      // read the live scan at render time, so they stay fresh across
      // syncs without rebuilding the renderer.
      ...(this.config.refs ? { terms: this.termHooks() } : {}),
      // Site-wide code options flow in explicitly (resolveConfig already
      // merged the defaults), instead of a module-level ambient state.
      code: this.config.code,
      shikiLangs: [...langs],
      islands: [
        ...BUILTIN_ISLAND_NAMES,
        ...Object.keys(this.config.islands),
      ].map(name => ({
        name,
        // Site islands declared as entry-list split their children into
        // `@@@` entries at build time (data-backed xlist pages).
        ...(this.config.entryListIslands.includes(name)
          ? { entryList: true }
          : {}),
      })),
      // Build component tags always resolve for extraction; the disable
      // policy is applied at the marker swap, so disabling never makes the
      // tag fall back to literal text.
      buildComponents: new Set(BUILD_COMPONENT_NAMES),
    });
    this.rendererPromise = promise;
    this.renderer = await promise;
    return this.renderer;
  }

  /** Union of fence languages over the scan cache (raw strings; the
   * renderer drops entries shiki cannot load — see isBundledLang). Term-ref
   * articles render through the same renderer, so their fences join the set. */
  private scannedLangs(): Iterable<string> {
    const langs = new Set<string>();
    for (const file of this.scan.files.values()) {
      for (const lang of file.fenceLangs) langs.add(lang);
    }
    if (this.refs) {
      for (const refs of this.refs.byLocale.values()) {
        for (const ref of refs.values()) {
          for (const lang of ref.fenceLangs) langs.add(lang);
        }
      }
    }
    return langs;
  }

  /** Full (re)scan; keeps render cache entries (freshness: mtime in build,
   * watcher events in dev — see renderPage). */
  async sync(mode: 'dev' | 'build'): Promise<void> {
    this.links.setMode(mode);
    this.trustWatcher = mode === 'dev';
    this.scan = await scanSite(this.config);
    this.pages = this.scan.sources;
    this.links.setPages(this.pages);
    if (this.config.refs) {
      this.refs = await scanRefs(this.config);
      if (!this.refs.present && !this.refsMissingWarned) {
        this.refsMissingWarned = true;
        console.warn(
          `[absolute-press] no refs directory "${this.config.refs}" found under ${this.config.contentDir}; [[...]] term references render as plain text (clone the refs repository, or unset config refs)`,
        );
      }
      // Ref markdown links resolve against the locale content root (see
      // LinkResolver.refRoots), not the ref file's own directory.
      this.links.setRefs(
        [...this.refs.byLocale.values()].flatMap(refs =>
          [...refs.values()].map(ref => ({
            filePath: ref.filePath,
            root: localeContentRoot(this.config, ref.locale),
          })),
        ),
      );
    } else {
      this.refs = null;
    }
    await this.ensureRenderer();
    // The renderer set is now disk-fresh; a stale invalidate flag would
    // only buy one redundant refresh.
    this.langsDirty = false;
    this.relatedCache = null;
    // New resolution round: page warnings may fire again from scratch.
    this.devWarned.clear();
    if (mode === 'build' || this.gitTimes.size === 0) {
      this.gitTimes = await getGitTimes(
        this.pages.map(p => p.filePath),
        this.config.contentDir,
      );
    }
    await this.refreshScanContext();
    if (mode === 'dev') this.warnArchiveCollisions();
  }

  /** Latest onScan hook result (undefined when no hook is configured). */
  get siteData(): unknown {
    return this.siteDataValue;
  }

  /**
   * Rebuild the onScan context and hook result from the current caches
   * (no disk IO); called by sync() and after dev content edits so the
   * site-data module stays fresh without a restart.
   */
  async refreshScanContext(): Promise<void> {
    if (!this.onScan) {
      this.siteDataValue = undefined;
      return;
    }
    const ctx: SiteScanContext = siteScanContext(
      this.config,
      this.scan,
      this.gitTimes,
    );
    this.siteDataValue = await this.onScan(ctx);
  }

  /**
   * Dev: re-read one edited ref file (single read) into the refs scan and
   * drop its cached render; the next page render re-renders the popover
   * html from the fresh source. Page caches stay untouched — ref edits do
   * not change page html beyond the embedded templates. Watcher paths may
   * differ in separators (same as invalidate).
   */
  invalidateRef(file: string): void {
    if (!this.refs) return;
    const posix = file.split(path.sep).join('/');
    for (const refs of this.refs.byLocale.values()) {
      for (const [id, ref] of refs) {
        if (ref.filePath.split(path.sep).join('/') !== posix) continue;
        const fresh = scanRefEntry(this.config, ref.locale, id);
        if (fresh) {
          refs.set(id, fresh);
          this.refRendered.delete(`${fresh.locale}/${fresh.id}`);
          // Same renderer-warm-up concern as invalidate(): an edit adding a
          // fence language outside the live shiki set must rebuild.
          for (const lang of fresh.fenceLangs) {
            if (!this.rendererLangs.has(lang)) {
              this.langsDirty = true;
              break;
            }
          }
        } else {
          refs.delete(id);
        }
        return;
      }
    }
  }

  /** Dev: drop one file's render cache (watcher paths may differ in separators). */
  invalidate(file: string): void {
    const posix = file.split(path.sep).join('/');
    for (const key of this.rendered.keys()) {
      if (key.split(path.sep).join('/') === posix) this.rendered.delete(key);
    }
    this.relatedCache = null;
    // The renderer's shiki set is frozen at creation; an edit introducing a
    // fence language outside it must rebuild, or the block highlights as
    // plain text until a restart. The refreshed scan entry carries the new
    // language set, and the dev middleware refreshes before serving, so the
    // full-reload this edit triggers arrives after the rebuild and
    // highlights the new language.
    if (this.rendererPromise === null) return;
    const fresh = this.refreshScanEntry(file);
    if (!fresh) return; // vanished mid-event; the resync path owns structural changes
    for (const lang of fresh.fenceLangs) {
      if (!this.rendererLangs.has(lang)) {
        this.langsDirty = true;
        break;
      }
    }
  }

  /** Dev: re-read one edited file into the scan cache (single read); null
   * when the file vanished mid-event. */
  private refreshScanEntry(file: string): ScannedFile | null {
    try {
      const fresh = scanFile(file);
      // Watcher paths may differ in separators from the walk keys; replace
      // under the existing key so renders and the onScan context keep one
      // entry per file instead of forking a second stale one.
      const posix = file.split(path.sep).join('/');
      const key =
        [...this.scan.files.keys()].find(
          k => k.split(path.sep).join('/') === posix,
        ) ?? file;
      this.scan.files.set(key, fresh);
      return fresh;
    } catch {
      return null;
    }
  }

  /**
   * Dev middleware gate: refresh the renderer when invalidated edits
   * introduced new languages. No-op on the common path (same-language
   * edits), so requests only pay a boolean check. A rebuild also drops the
   * render cache: html produced by the previous renderer (rss read mid-edit,
   * a probe between invalidate and refresh) must not keep its plain-text
   * fences.
   */
  async refreshRenderer(): Promise<void> {
    if (!this.langsDirty) return;
    this.langsDirty = false;
    await this.ensureRenderer();
    this.rendered.clear();
    this.refRendered.clear();
    this.relatedCache = null;
  }

  /** Dev: structural change (add/unlink) — rescan and clear all caches. */
  async resync(mode: 'dev' | 'build'): Promise<void> {
    this.rendered.clear();
    this.refRendered.clear();
    // Drop the git-times cache too: sync() re-pulls it only when empty, and
    // commits landing mid-dev-session must surface as fresh lastmod values.
    this.gitTimes.clear();
    await this.sync(mode);
  }

  /**
   * Dev feedback parity for archive route collisions: build fails on them
   * in emitAll(), but dev must stay browsable — warn instead of throwing,
   * keeping devHtml's winner semantics (the page serves, archives follow).
   * Runs once per sync/resync — never on the request path — and dedupes
   * identical warnings across resyncs so unrelated structural edits do not
   * re-print a known collision (a changed list warns again).
   */
  private warnArchiveCollisions(): void {
    // A render error during the pre-check must not break sync: the request
    // path reports it as before (500 on the offending page), so swallow and
    // skip this pass of the check.
    try {
      const ctx = this.buildContext();
      const archives = [
        ...this.archivePages(ctx, 'category'),
        ...this.archivePages(ctx, 'tag'),
      ];
      let message: string | null = null;
      try {
        // Same assertion the build emit uses; catch turns it into a warning.
        assertNoArchiveCollisions(this.pages, archives);
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      if (message === null) {
        this.lastCollisionWarn = null;
        return;
      }
      if (message === this.lastCollisionWarn) return;
      this.lastCollisionWarn = message;
      console.warn(
        `${message} (dev keeps the route browsable; build will fail)`,
      );
    } catch {
      // ignored: see the comment at the top
    }
  }

  /** Scan entry of one page; sync() guarantees an entry per page, so a
   * miss means a caller bypassed sync() — fail loudly. */
  private scanOf(page: PageSource): ScannedFile {
    const file = this.scan.files.get(page.filePath);
    if (!file) {
      throw new Error(`[absolute-press] scan cache miss for ${page.filePath}`);
    }
    return file;
  }

  /**
   * Render one page from the scan cache (source and mtime of its single
   * read; see scanSite). The cache key keeps its semantics: dev trusts the
   * watcher's invalidate()/resync() as the sole freshness mechanism and
   * skips the compare, build has no watcher and falls back to mtime — the
   * scan re-stat'ed every file this sync, so its snapshot serves the check.
   */
  private renderPage(page: PageSource, file: ScannedFile): RenderedEntry {
    const renderer = this.renderer;
    if (!renderer) throw new Error('SiteStore.sync() not awaited');
    const cached = this.rendered.get(page.filePath);
    if (cached) {
      if (this.trustWatcher) return cached;
      if (cached.mtimeMs === file.mtimeMs) return cached;
    }
    const result = renderer.render(file.source, {
      filePath: page.filePath,
      // Build-time copy (heimu tooltip) resolves by lang, like the client.
      lang: page.locale.lang,
    });
    const entry: RenderedEntry = {
      mtimeMs: file.mtimeMs,
      result,
      excerpt: plainExcerpt(result.html, META_EXCERPT_LIMIT),
    };
    this.rendered.set(page.filePath, entry);
    return entry;
  }

  /** Render every page (cached), carrying meta and html for the emit pass. */
  private renderAll(): EmittedPage[] {
    return this.pages.map(p => {
      const file = this.scanOf(p);
      const entry = this.renderPage(p, file);
      return {
        ...p,
        meta: this.metaOf(p, file, entry),
        html: entry.result.html,
      };
    });
  }

  /**
   * Render everything once and derive the data shared by all page/archive
   * payloads. Reusing one context per dev request / emit pass keeps per-page
   * work linear; re-rendering per page previously re-stated every file for
   * every emitted page (O(N^2) stat calls).
   */
  private buildContext(): RenderContext {
    const pages = this.renderAll();
    return {
      pages,
      byRoute: new Map(pages.map(p => [p.route, p])),
      chrome: new Map(),
      siblings: siblingIndex(pages),
      archiveAlternates: null,
      integrations: this.siteIntegrations(pages),
    };
  }

  /** Compute-if-absent per-locale chrome (navbar/sidebar/articles). */
  private chromeOf(ctx: RenderContext, key: string): LocaleChrome {
    let chrome = ctx.chrome.get(key);
    if (!chrome) {
      const siblings = ctx.pages.filter(p => p.locale.key === key);
      const { nav } = this.config;
      // Sidebar shares the navbar's display labels so drawer and rail never
      // contradict the navbar wording; groups stay navbar-only (the sidebar
      // must keep the full tree).
      const labels = Object.fromEntries(
        Object.entries(nav.tweaks ?? {}).flatMap(([dir, t]) =>
          t.label === undefined ? [] : [[dir, t.label] as const],
        ),
      );
      // One tree pass feeds both views; standalone buildNavbar/buildSidebar
      // would rebuild the same directory tree twice per locale.
      const { navbar, sidebar } = buildChrome(siblings, nav.exclude, {
        tweaks: nav.tweaks,
        order: nav.order,
        labels,
        sidebar: this.config.sidebar,
      });
      chrome = {
        articles: buildArticles(siblings),
        navbar,
        sidebar,
      };
      ctx.chrome.set(key, chrome);
    }
    return chrome;
  }

  private renderedOf(page: PageSource, ctx: RenderContext): EmittedPage {
    const rendered = ctx.byRoute.get(page.route);
    // The context is built from the same page list the caller iterates, so
    // a miss means the caller skipped buildContext(); fail loudly rather
    // than silently re-rendering behind the shared cache.
    if (!rendered) {
      throw new Error(
        `[absolute-press] page ${page.filePath} not in render context`,
      );
    }
    return rendered;
  }

  private metaOf(
    page: PageSource,
    file: ScannedFile,
    entry: RenderedEntry,
  ): PageMeta {
    const { result, excerpt } = entry;
    // Frontmatter comes from the scan pass (the single parse); invalid dates
    // already warned there (createdAtOf with filePath), so this
    // re-derivation stays silent.
    return {
      route: page.route,
      locale: page.locale.key,
      title: result.title ?? '',
      headings: result.headings,
      frontmatter: file.frontmatter,
      createdAt: createdAtOf(file.frontmatter),
      updatedAt: this.gitTimes.get(page.filePath) ?? null,
      // Omitted when the site disables it; the client hides an absent value.
      ...(this.config.readingTime ? { readingTime: result.readingTime } : {}),
      // Omitted when empty: head consumers fall back to site.description.
      ...(excerpt ? { excerpt } : {}),
    };
  }

  /** Aggregated `/category/<name>` and `/tag/<name>` pages. */
  private archivePages(
    ctx: RenderContext,
    kind: 'category' | 'tag',
  ): ArchivePage[] {
    const out: ArchivePage[] = [];
    for (const locale of this.config.locales) {
      const articles = this.chromeOf(ctx, locale.key).articles;
      for (const group of groupArchiveArticles(articles, kind)) {
        out.push({
          route: `${locale.prefix}/${kind}/${encodeURIComponent(group.name)}`,
          title: group.name,
          locale,
          kind,
          articles: group.articles,
        });
      }
    }
    return out;
  }

  /**
   * Page-route -> related links map (mutual reference counts). Lazy: built
   * from the cached render results once, reused for every page payload.
   * Options flow in explicitly (resolved site config, no ambient channel).
   */
  private related(): Map<string, RelatedLink[]> {
    this.relatedCache ??= buildRelatedMap(
      this.pages.map(p => {
        const result = this.renderPage(p, this.scanOf(p)).result;
        return {
          route: p.route,
          locale: p.locale.key,
          title: result.title ?? '',
          links: result.links,
        };
      }),
      this.config.related,
    );
    return this.relatedCache;
  }

  /**
   * hreflang alternates of one page: the same relPath in the other locale
   * trees. Locale directories mirror by convention only — nothing
   * guarantees a counterpart exists — so every entry is checked against the
   * scanned pages and a missing translation simply drops out (no invented
   * URLs). Undefined when fewer than two locales carry the page.
   */
  private alternatesOf(
    ctx: RenderContext,
    page: PageSource,
  ): PageAlternate[] | undefined {
    const group = ctx.siblings.get(page.relPath);
    if (!group) return undefined;
    return alternatesIn(this.config, group, p => ({
      lang: p.locale.lang,
      route: p.route,
    }));
  }

  /**
   * Archive key `<kind>/<name>` -> alternates, derived like page
   * alternates from the per-locale archive sets. Lazy: it calls chromeOf()
   * for every locale, which must not happen on a dev request touching one
   * locale only.
   */
  private archiveAlternatesOf(
    ctx: RenderContext,
  ): Map<string, PageAlternate[]> {
    ctx.archiveAlternates ??= (() => {
      const groups = new Map<string, Map<string, PageAlternate>>();
      for (const archive of [
        ...this.archivePages(ctx, 'category'),
        ...this.archivePages(ctx, 'tag'),
      ]) {
        const key = `${archive.kind}/${archive.title}`;
        let group = groups.get(key);
        if (!group) {
          group = new Map();
          groups.set(key, group);
        }
        group.set(archive.locale.key, {
          lang: archive.locale.lang,
          route: archive.route,
        });
      }
      const out = new Map<string, PageAlternate[]>();
      for (const [key, group] of groups) {
        const alternates = alternatesIn(this.config, group, a => a);
        if (alternates) out.set(key, alternates);
      }
      return out;
    })();
    return ctx.archiveAlternates;
  }

  /** PageMeta plus the alternates field (absent when trivial). */
  private withAlternates(
    ctx: RenderContext,
    page: PageSource,
    meta: PageMeta,
  ): PageMeta {
    const alternates = this.alternatesOf(ctx, page);
    return alternates ? { ...meta, alternates } : meta;
  }

  private payloadFor(page: RenderedPage, ctx: RenderContext): PagePayload {
    const chrome = this.chromeOf(ctx, page.locale.key);
    const encrypted = encryptRuleFor(page.route, this.config.encrypt);
    const payload: PagePayload = {
      site: this.siteBlock(ctx, page.route, page.locale.key, {
        // Serialized only when non-default to keep the payload small.
        ...(this.config.home.feedPerPage !== HOME_FEED_PER_PAGE
          ? { feedPerPage: this.config.home.feedPerPage }
          : {}),
        ...(this.config.archive.perPage !== ARCHIVE_PER_PAGE
          ? { archivePerPage: this.config.archive.perPage }
          : {}),
        ...(this.config.footer
          ? { footerCredit: this.config.footer.credit }
          : {}),
      }),
      navbar: chrome.navbar,
      sidebar: chrome.sidebar,
      page: this.withAlternates(ctx, page, page.meta),
    };
    // Feed can be disabled site-wide (docs/landing home pages keep their
    // prose intro as the visual primary).
    if (isLocaleHome(page) && this.config.home.feed)
      payload.articles = chrome.articles;
    // Filled only when non-empty to keep the serialized payload small. Locale
    // homes are excluded outright: the related graph is article-tail chrome,
    // and the client skips non-article pages via the same seoPageType
    // predicate (mountRelatedGraph) — filling `related` there would only
    // bloat the landing page's payload with data nothing renders. Note this
    // is independent of the home feed config: feed and feed:false homes are
    // both website pages.
    if (seoPageType(payload) === 'article') {
      const related = this.related().get(page.route);
      if (related && related.length > 0) payload.related = related;
    }
    if (encrypted) payload.encrypted = encrypted;
    return payload;
  }

  /**
   * Icon subset used by the site's pages and social entries + Algolia
   * config, when present.
   */
  private siteIntegrations(
    pages: RenderedPage[],
  ): Pick<PagePayload['site'], 'icons' | 'algolia' | 'social' | 'logo'> {
    const used = new Set<string>();
    for (const p of pages) {
      const icon = p.meta.frontmatter.icon;
      if (icon && icon in this.config.icons) used.add(icon);
    }
    // Config-icon social entries ride along in the payload icon subset;
    // built-in brand keys resolve client-side and need no registration.
    for (const s of this.config.nav.social ?? []) {
      if (s.icon in this.config.icons) used.add(s.icon);
    }
    return {
      ...(used.size > 0
        ? {
            icons: Object.fromEntries(
              [...used]
                .toSorted()
                .map(key => [key, this.config.icons[key] ?? '']),
            ),
          }
        : {}),
      ...(this.config.algolia ? { algolia: this.config.algolia } : {}),
      ...(this.config.nav.social ? { social: this.config.nav.social } : {}),
      ...(this.config.nav.logo ? { logo: this.config.nav.logo } : {}),
    };
  }

  /**
   * Term-ref hooks wired to the refs scan: title lookup for the inline rule,
   * one warning per unknown id. The closures read the live scan at render
   * time, so renderer reuse across syncs stays correct.
   */
  private termHooks(): TermHooks {
    return {
      titleOf: (id, env) => {
        const ref = this.termRefOf(id, env.filePath);
        return ref === null ? null : refTitle(ref);
      },
      onMiss: (id, env) => {
        // The whole refs tree may be absent (nested repo not cloned): the
        // sync-time notice already covers it, per-id noise adds nothing.
        if (this.refs?.present === false) return;
        this.warnOnce(
          `term:${id}`,
          `[absolute-press] unknown term reference [[${id}]] in ${env.filePath}: no such article in the refs directory; renders as plain text`,
        );
      },
    };
  }

  /** Ref lookup for a `[[id]]` in a file: the file's own locale first, then
   * the default locale's fallback set. */
  private termRefOf(id: string, filePath: string): ScannedRef | null {
    if (!this.refs) return null;
    return lookupRef(
      this.refs,
      id,
      localeKeyOf(this.config, filePath),
      this.config,
    );
  }

  /** `<html lang>` of a locale key (ref entries carry only the key). */
  private langOf(localeKey: string): string | undefined {
    return this.config.locales.find(l => l.key === localeKey)?.lang;
  }

  /** Cached render of one ref article, keyed `<locale>/<id>`. Freshness
   * mirrors renderPage: dev trusts the watcher (invalidateRef), build
   * compares the scan's mtime. */
  private refHtml(ref: ScannedRef): string {
    const renderer = this.renderer;
    if (!renderer) throw new Error('SiteStore.sync() not awaited');
    const key = `${ref.locale}/${ref.id}`;
    const cached = this.refRendered.get(key);
    if (cached && (this.trustWatcher || cached.mtimeMs === ref.mtimeMs)) {
      return cached.html;
    }
    const html = renderer.renderRef(ref.source, {
      filePath: ref.filePath,
      lang: this.langOf(ref.locale),
    });
    this.refRendered.set(key, { mtimeMs: ref.mtimeMs, html });
    return html;
  }

  /**
   * Append `<template class="ap-term-def">` bodies for every term id the
   * html references (the client popover clones them on demand). One pass
   * over the appended templates picks up ids nested inside ref articles
   * themselves — a popover inside a popover — with the done set bounding
   * the walk (an id renders at most once per page).
   */
  private injectTermDefs(page: PageSource, html: string): string {
    if (!this.refs || !html.includes('data-term=')) return html;
    const done = new Set<string>();
    const parts: string[] = [];
    let scan = html;
    for (;;) {
      const round: string[] = [];
      for (const match of scan.matchAll(/data-term="([^"]+)"/g)) {
        const id = match[1]!;
        if (done.has(id)) continue;
        done.add(id);
        // Unresolved ids already warned at render time (onMiss); their
        // spans degraded to plain text, so nothing to embed.
        const ref = lookupRef(this.refs, id, page.locale.key, this.config);
        if (!ref) continue;
        const def = `<template class="ap-term-def" data-term="${escapeHtml(id)}">${this.refHtml(ref)}</template>`;
        parts.push(def);
        round.push(def);
      }
      if (round.length === 0) break;
      scan = round.join('');
    }
    // Dev parity for dead links inside ref articles: they surface here per
    // request; the build reports the same records through deadLinks().
    if (this.trustWatcher) {
      for (const dead of this.links.deadLinks) {
        if (!isRefFile(this.config, dead.file)) continue;
        this.warnOnce(
          `term-dead:${dead.file}:${dead.raw}`,
          `[absolute-press] dev: dead link in ref article ${dead.file} -> ${dead.raw} (build will fail)`,
        );
      }
    }
    return parts.length === 0 ? html : html + parts.join('');
  }

  /**
   * Page-body decorations around the static markdown HTML: build component
   * markers resolve to their final HTML (gated pages keep them inside the
   * gate), gated pages are wrapped in a PasswordGate island placeholder
   * (content hidden until the client gate unlocks it); article pages get the
   * Giscus island appended.
   */
  private decorateContent(
    page: PageSource,
    payload: PagePayload,
    html: string,
    ctx: RenderContext,
  ): string {
    let content = this.swapBuildComponents(page, ctx, html);
    // Term templates ride inside the same gate wrap: a gated page must not
    // leak its reference bodies before the client unlocks it.
    content = this.injectTermDefs(page, content);
    const encrypted = payload.encrypted;
    if (encrypted) {
      // PasswordGate derives its messages from the page language client-side;
      // no locale prop (the island would ignore it anyway).
      const props = escapeHtml(
        JSON.stringify({
          hashes: encrypted.hashes,
          ...(encrypted.hint !== undefined ? { hint: encrypted.hint } : {}),
        }),
      );
      content =
        `${GATE_STYLE}<div data-ap-island="PasswordGate" data-props="${props}">` +
        `${content}</div>`;
    }
    const giscus = this.config.giscus;
    if (giscus && !isLocaleHome(page)) {
      const props = escapeHtml(
        JSON.stringify({ ...giscus, lang: page.locale.lang }),
      );
      content += `<div data-ap-island="Giscus" data-props="${props}"></div>`;
    }
    return content;
  }

  /** Marker div emitted by the markdown renderer for a build component tag;
   * the props attribute is URI-encoded (see renderBuildComponentMarker). */
  private swapBuildComponents(
    page: PageSource,
    ctx: RenderContext,
    html: string,
  ): string {
    if (!html.includes('data-ap-build=')) return html;
    const buildCtx: BuildComponentContext = {
      config: this.config,
      // Locale-scoped article list; titles exist because this runs after the
      // full render pass (chromeOf derives from RenderedPages).
      articles: this.chromeOf(ctx, page.locale.key).articles,
      base: baseOf(page.route),
      icons: this.config.icons,
      lang: page.locale.lang,
      route: page.route,
      filePath: page.filePath,
    };
    return html.replace(
      BUILD_MARKER_RE,
      (_match, name: string, encoded: string) => {
        if (this.config.buildComponents.disabled.includes(name)) {
          this.warnOnce(
            `build-component:${page.filePath}:${name}`,
            `[absolute-press] build component <${name}> is disabled (config buildComponents.disable); the tag in ${page.filePath} renders nothing`,
          );
          return '';
        }
        const render = BUILD_COMPONENT_RENDERERS[name];
        // Extraction only registers registry names, so a miss is registry
        // drift between shared/components.ts and here — render nothing rather
        // than leaking a transient marker into the page.
        if (render === undefined) return '';
        const props: Record<string, unknown> = JSON.parse(
          decodeURIComponent(encoded),
        );
        return render(props, buildCtx);
      },
    );
  }

  /** Frontmatter icons missing from the config icons map (build error). */
  private invalidIcons(
    pages: RenderedPage[],
  ): { file: string; icon: string }[] {
    const out: { file: string; icon: string }[] = [];
    for (const p of pages) {
      const icon = p.meta.frontmatter.icon;
      if (icon && !(icon in this.config.icons)) {
        out.push({ file: p.filePath, icon });
      }
    }
    return out;
  }

  /**
   * Shared `payload.site` block of one locale's pages; page payloads pass
   * the home/archive/footer knobs as `extra` (archive pages carry none).
   * Integrations stay last — key order drives the serialized JSON order.
   */
  private siteBlock(
    ctx: RenderContext,
    route: string,
    localeKey: string,
    extra: Pick<
      PagePayload['site'],
      'feedPerPage' | 'archivePerPage' | 'footerCredit'
    > = {},
  ): PagePayload['site'] {
    return {
      title: this.config.title,
      description: this.config.description,
      base: baseOf(route),
      locales: this.config.locales,
      locale: localeKey,
      // Serialized only when non-default to keep the payload small.
      ...(this.config.nav.align === 'center'
        ? { navAlign: this.config.nav.align }
        : {}),
      ...extra,
      ...ctx.integrations,
    };
  }

  /**
   * renderShell arguments shared by page and archive emits; callers add
   * `payload` + `content` (and `katexHref`, decided per page below).
   * Speculative loading is a production delivery concern; dev pages keep
   * on-demand compilation semantics.
   */
  private shellArgs(
    assets: BuildAssets,
    locale: LocaleInfo,
  ): Omit<ShellInput, 'payload' | 'content'> {
    return {
      scriptSrc: assets.scriptFile,
      cssHrefs: assets.cssFiles,
      locale,
      hostname: this.config.hostname,
      speculationRules: assets.isBuild,
      modulepreload: assets.isBuild,
      ...(this.config.favicon ? { favicon: this.config.favicon } : {}),
      ...(this.config.seo?.image ? { ogImage: this.config.seo.image } : {}),
      ...(this.config.seo?.author ? { author: this.config.seo.author } : {}),
      ...(this.config.googleAnalytics
        ? { gaId: this.config.googleAnalytics }
        : {}),
    };
  }

  /**
   * Dev feedback parity for the served page (build reports both as errors in
   * generateBundle): dead links (markdown + images, same record/line join as
   * the build error) and frontmatter icons missing from the config map.
   * Warns once per issue — deduped across requests, reset by sync() with the
   * resolver's record round — and only ever inspects the current page, so
   * the request path gains no site-wide scan.
   */
  private warnDevPageIssues(page: PageSource, rendered: EmittedPage): void {
    const entry = this.rendered.get(page.filePath);
    if (!entry) return;
    const dead = deadLinkReport(
      this.links.deadLinks.filter(d => d.file === page.filePath),
      [{ file: page.filePath, links: entry.result.links }],
    );
    if (dead.length > 0) {
      const list = dead
        .map(
          d =>
            `  ${d.file}${d.line === undefined ? '' : `:${d.line}`} -> ${d.raw}`,
        )
        .join('\n');
      this.warnOnce(
        `dead:${page.filePath}:${dead.map(d => d.raw).join('|')}`,
        `[absolute-press] dev: ${dead.length} dead link(s) in ${page.filePath} (build will fail):\n${list}`,
      );
    }
    const [badIcon] = this.invalidIcons([rendered]);
    if (badIcon) {
      this.warnOnce(
        `icon:${badIcon.file}:${badIcon.icon}`,
        `[absolute-press] dev: frontmatter icon "${badIcon.icon}" in ${badIcon.file} is not registered in config icons map (build will fail)`,
      );
    }
  }

  /** First warn wins; identical issues stay silent until the next sync. */
  private warnOnce(key: string, message: string): void {
    if (this.devWarned.has(key)) return;
    this.devWarned.add(key);
    console.warn(message);
  }

  /** Dev middleware / build emitter: full HTML for a page route, or null. */
  htmlForPage(
    page: PageSource,
    assets: BuildAssets,
    ctx: RenderContext,
  ): string {
    const rendered = this.renderedOf(page, ctx);
    // Dev-only feedback; the build emit path reports through generateBundle.
    if (this.trustWatcher) this.warnDevPageIssues(page, rendered);
    const payload = this.payloadFor(rendered, ctx);
    const content = this.decorateContent(page, payload, rendered.html, ctx);
    return renderShell({
      ...this.shellArgs(assets, page.locale),
      // Only math pages carry the katex stylesheet; the check runs on the
      // decorated content, so math living solely inside term-ref popover
      // templates is covered too. The decision re-reads the cached html
      // each pass, so it can never go stale.
      ...(pageUsesKatex(content)
        ? { katexHref: this.katexHref(assets.isBuild) }
        : {}),
      payload,
      content,
    });
  }

  private archiveHtml(
    archive: ArchivePage,
    assets: BuildAssets,
    ctx: RenderContext,
  ): string {
    const meta: PageMeta = {
      route: archive.route,
      locale: archive.locale.key,
      title: archive.title,
      headings: [],
      frontmatter: {},
      createdAt: null,
      updatedAt: null,
    };
    const chrome = this.chromeOf(ctx, archive.locale.key);
    const alternates = this.archiveAlternatesOf(ctx).get(
      `${archive.kind}/${archive.title}`,
    );
    const payload: PagePayload = {
      site: this.siteBlock(ctx, archive.route, archive.locale.key),
      navbar: chrome.navbar,
      sidebar: chrome.sidebar,
      page: alternates ? { ...meta, alternates } : meta,
      articles: archive.articles,
    };
    // No katexHref: archive content is a plain heading plus the article
    // list — it never renders math.
    return renderShell({
      ...this.shellArgs(assets, archive.locale),
      payload,
      content: `<h1>${escapeHtml(archive.title, { attr: false })}</h1>`,
    });
  }

  private katexHref(build: boolean): string {
    return build ? 'assets/katex/katex.min.css' : katexDevHref();
  }

  /** Dead links collected across all renders since last sync. */
  deadLinks(): DeadLink[] {
    // Line numbers live on the rendered CollectedLink entries, not on the
    // resolver records; deadLinkReport joins both by file+raw.
    const rendered = [...this.rendered].map(([file, entry]) => ({
      file,
      links: entry.result.links,
    }));
    return deadLinkReport(this.links.deadLinks, rendered);
  }

  /** Bare relative links collected across all renders since last sync. */
  bareLinks(): DeadLink[] {
    const rendered = [...this.rendered].map(([file, entry]) => ({
      file,
      links: entry.result.links,
    }));
    return bareLinkReport(rendered);
  }

  // -- Dev entry points -----------------------------------------------------

  devAssets: BuildAssets = {
    isBuild: false,
    // Linked installs keep the entry outside the vite root, where a
    // root-relative URL cannot resolve; /@fs/ serves it from the package.
    scriptFile: devFsUrl(clientEntry()),
    cssFiles: [],
  };

  /** Dev: HTML for a URL path; null when no page matches. */
  devHtml(url: string): string | null {
    // Routes are the clean canonical URLs, so the request path matches
    // verbatim (`/` is the home route, `/guide/` a slash-mode directory
    // index). Legacy `.html` URLs and non-canonical directory forms
    // (`/guide` in slash mode, `/guide/` in bare mode) are a
    // production-host redirect concern; dev simply 404s them.
    const route = url === '' ? '/' : url;
    const ctx = this.buildContext();
    const page = this.links.pageForRoute(route);
    if (page) return this.htmlForPage(page, this.devAssets, ctx);
    const archive = [
      ...this.archivePages(ctx, 'category'),
      ...this.archivePages(ctx, 'tag'),
    ].find(a => a.route === route);
    return archive ? this.archiveHtml(archive, this.devAssets, ctx) : null;
  }

  rss(): string {
    const feedable = this.renderAll().filter(
      p => p.meta.frontmatter.feed !== false,
    );
    return renderRss(this.config, this.feedArticles(feedable));
  }

  /** Feed items: article info zipped with the page's rendered content HTML. */
  private feedArticles(pages: EmittedPage[]): FeedArticle[] {
    const htmlByRoute = new Map(pages.map(p => [p.route, p.html]));
    return buildArticles(pages).map(a => ({
      ...a,
      html: htmlByRoute.get(a.route) ?? '',
    }));
  }

  // -- Build entry points ---------------------------------------------------

  /** Build: render everything and return files for generateBundle emit. */
  emitAll(assets: BuildAssets): EmittedFile[] {
    const ctx = this.buildContext();
    const badIcons = this.invalidIcons(ctx.pages);
    if (badIcons.length > 0) {
      const list = badIcons
        .map(b => `  ${b.file}: icon "${b.icon}"`)
        .join('\n');
      throw new Error(
        `[absolute-press] frontmatter icon(s) not registered in config icons map:\n${list}`,
      );
    }
    const out: EmittedFile[] = [];
    for (const page of this.pages) {
      out.push({
        fileName: routeToFileName(
          page.route,
          this.config.urls.directoryIndex,
          INDEX_STEMS.has(stemOf(page.relPath)),
        ).slice(1),
        source: this.htmlForPage(page, assets, ctx),
      });
    }
    const archives = [
      ...this.archivePages(ctx, 'category'),
      ...this.archivePages(ctx, 'tag'),
    ];
    assertNoArchiveCollisions(this.pages, archives);
    for (const archive of archives) {
      out.push({
        fileName: routeToFileName(
          archive.route,
          this.config.urls.directoryIndex,
        ).slice(1),
        source: this.archiveHtml(archive, assets, ctx),
      });
    }
    for (const [fileName, buf] of this.links.images) {
      out.push({ fileName, source: buf });
    }
    // KaTeX css + woff2 fonts ship only when at least one page rendered
    // math; a math-free site carries neither (same check the shell uses).
    // Ref articles render lazily during the page loop above, so their math
    // is covered by the refRendered pass.
    if (
      ctx.pages.some(p => pageUsesKatex(p.html)) ||
      [...this.refRendered.values()].some(r => pageUsesKatex(r.html))
    ) {
      out.push(...katexAssets());
    }
    // Static hosts serve /404.html for unknown paths; a content page
    // occupying the route (a 404.md at the content root) wins.
    if (!ctx.byRoute.has('/404')) {
      out.push({ fileName: '404.html', source: renderNotFound(this.config) });
    }
    // Pages carry their git last-commit time as lastmod; synthetic archive
    // pages have no source file and stay lastmod-less. Both carry their
    // hreflang alternates when cross-locale counterparts exist. Gated pages
    // and the 404 override stay out: a sitemap entry advertises the URL to
    // crawlers, defeating the gate's unlisted posture.
    const sitemapEntries: SitemapEntry[] = [
      ...ctx.pages
        .filter(
          p =>
            !encryptRuleFor(p.route, this.config.encrypt) &&
            !isNotFoundRoute(p.route) &&
            !isNavExcluded(p.route, this.config.seo?.exclude ?? []),
        )
        .map(p => ({
          route: p.route,
          lastmod: p.meta.updatedAt,
          alternates: this.alternatesOf(ctx, p),
        })),
      ...archives.map(a => ({
        route: a.route,
        lastmod: null,
        alternates: this.archiveAlternatesOf(ctx).get(`${a.kind}/${a.title}`),
      })),
    ];
    const feedable = ctx.pages.filter(p => p.meta.frontmatter.feed !== false);
    out.push({
      fileName: 'rss.xml',
      source: renderRss(this.config, this.feedArticles(feedable)),
    });
    out.push({
      fileName: 'sitemap.xml',
      source: renderSitemap(this.config, sitemapEntries),
    });
    out.push({ fileName: 'robots.txt', source: renderRobots(this.config) });
    // `_headers` ships by default: Cloudflare Pages / Netlify apply it,
    // every other host serves it as an inert file. A site's own
    // public/_headers takes over — skipping avoids writing the same output
    // path twice (vite copies public files next to the emitted assets).
    const userHeaders =
      this.config.publicDir !== null &&
      fs.existsSync(path.join(this.config.publicDir, '_headers'));
    if (userHeaders) {
      console.warn(
        '[absolute-press] public/_headers found; keeping it instead of emitting the default _headers',
      );
    } else {
      out.push({
        fileName: '_headers',
        source: renderCloudflareHeaders(assets.scriptFile),
      });
    }
    return out;
  }
}
