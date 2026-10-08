import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  searchForWorkspaceRoot,
  type Plugin,
  type UserConfig,
  type ViteDevServer,
} from 'vite';

import type { AbsolutePressConfig } from '../config.ts';
import { resolveConfig, type ResolvedConfig } from '../config.ts';
import { devFsUrl } from './assets.ts';
import { clientEntry, packageRoot } from './clientEntry.ts';
import { SiteStore } from './site.ts';

const VIRTUAL_ISLANDS_ID = 'virtual:absolute-press/islands';
const RESOLVED_ISLANDS_ID = '\0virtual:absolute-press/islands';
/** Posix prefix of the framework's client sources: /@fs/ dev URLs of app
 * modules must land here (root-relative `/src/` when root == package root). */
const APP_SRC_PREFIX = `${toPosix(path.resolve(packageRoot(), 'src'))}/`;

/** Window that merges structural watcher bursts (git checkout, bulk moves,
 * editor atomic saves) into one trailing resync. */
const STRUCTURE_DEBOUNCE_MS = 100;

/** Static imports of the graph chart, loaded from lazy island code the dev
 * dep scanner cannot reach through the virtual island registry. */
const GRAPH_DEPS = ['d3-drag', 'd3-force', 'd3-selection', 'd3-zoom'] as const;

/** This package's name, read from our own manifest so forked packages keep
 * the nested optimizeDeps.include ids below valid. */
const PKG_NAME = (
  JSON.parse(
    fs.readFileSync(path.join(packageRoot(), 'package.json'), 'utf8'),
  ) as { name: string }
).name;

/**
 * `vite.config.ts`: `plugins: [..., absolutePress(defineSiteConfig({...}))]`.
 *
 * - dev: middleware renders the md page matching the URL to a full HTML
 *   shell; md edits trigger a full reload.
 * - build: client bundle from src/client/runtime/entry.tsx, then one HTML
 *   asset per page via emitFile, plus rss.xml / sitemap.xml / robots.txt,
 *   content images and the KaTeX stylesheet.
 */
export function absolutePress(userConfig: AbsolutePressConfig): Plugin {
  let config: ResolvedConfig;
  let store: SiteStore;
  // Vitest loads the vite config too; stay inert there.
  const inert = Boolean(process.env.VITEST);
  let isBuild = false;

  const islandsModule = (): string => {
    const entries = Object.entries(config.islands);
    const imports = entries.map(
      ([, mod], i) =>
        `import I${i} from ${JSON.stringify(islandSpecifier(mod, isBuild))};`,
    );
    const body = entries
      .map(([tag], i) => `${JSON.stringify(tag)}: I${i}`)
      .join(', ');
    return `${imports.join('\n')}\nexport default { ${body} };\n`;
  };

  return {
    name: 'absolute-press',
    config(cfg, env) {
      if (inert) return {};
      isBuild = env.command === 'build';
      // Vite resolves root the same way (cfg.root ?? cwd, made absolute);
      // module and asset resolution below must follow that root, not the
      // arbitrary process cwd vite may have been started from.
      const root = path.resolve(cfg.root ?? process.cwd());
      return {
        // No index.html SPA fallback; the middleware serves pages itself.
        appType: 'custom',
        // Pre-bundle GRAPH_DEPS with nested ids ('<pkg> > d3-force'): they
        // resolve through this package's install dir, so consumer sites
        // never declare d3-*, and runtime bare imports match these chunks
        // via the '> dep' suffix — no mid-session re-optimize + full reload
        // on the first article page.
        optimizeDeps: {
          include: GRAPH_DEPS.map(dep => `${PKG_NAME} > ${dep}`),
        },
        resolve: {
          // Dev picks the browser dev build, build the prod one.
          alias: solidWebAlias(env.command === 'serve', root),
        },
        build: {
          rollupOptions: { input: clientEntry() },
        },
        server: { fs: { allow: devFsAllow(cfg, root) } },
      };
    },
    configResolved(viteConfig) {
      if (inert) return;
      config = resolveConfig(
        userConfig,
        viteConfig.root,
        // vite leaves publicDir '' when disabled via `publicDir: false`.
        viteConfig.publicDir || false,
      );
      store = new SiteStore(config);
    },
    resolveId(id) {
      if (!inert && id === VIRTUAL_ISLANDS_ID) return RESOLVED_ISLANDS_ID;
      return null;
    },
    load(id) {
      if (!inert && id === RESOLVED_ISLANDS_ID) return islandsModule();
      return null;
    },
    async buildStart() {
      // rolldown-vite also runs buildStart for the dev server; only the
      // actual build may flip the link resolver into asset-copy mode.
      if (inert || !isBuild) return;
      await store.sync('build');
    },
    configurePreviewServer(server) {
      if (inert) return;
      // appType 'custom' makes vite preview serve dist as bare static files:
      // directory URLs (`/`, `/guide/`) 404 instead of resolving the folder's
      // index.html, and extensionless page URLs (`/guide/a`) 404 instead of
      // resolving `/guide/a.html`. Rewrite them before the static middleware
      // runs — the same resolution production hosts (GH Pages / CF Pages)
      // apply. On-disk names are the decoded route file names
      // (routeToFileName), so real files and missing paths still fall
      // through to the static server's 404.
      const outDir = path.resolve(
        server.config.root,
        server.config.build.outDir,
      );
      const bare = config.urls.directoryIndex === 'bare';
      /** Decoded existence check for `<pathname><suffix>` inside outDir. */
      const existsInDist = (pathname: string, suffix: string): boolean => {
        let decoded: string;
        try {
          decoded = decodeURIComponent(pathname);
        } catch {
          return false; // malformed percent-encoding: not a page route
        }
        const abs = path.resolve(outDir, `.${decoded}${suffix}`);
        const rel = path.relative(outDir, abs);
        if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
        return fs.existsSync(abs);
      };
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.endsWith('/')) {
          // Bare mode mirrors CF Pages: a directory URL keeps its canonical
          // form without the trailing slash.
          if (
            bare &&
            url.pathname !== '/' &&
            existsInDist(url.pathname, 'index.html')
          ) {
            url.pathname = url.pathname.slice(0, -1);
            previewRedirect(url, res);
            return;
          }
          url.pathname += 'index.html';
          req.url = `${url.pathname}${url.search}`;
          next();
          return;
        }
        // Extensionful URLs (assets, legacy .html bookmarks) serve as-is.
        // A dotted file stem (notes/vue.js.md -> /notes/vue.js) is a page
        // too: extname cannot tell it from an asset, the dist probe can.
        if (path.extname(url.pathname) !== '') {
          if (
            !existsInDist(url.pathname, '') &&
            existsInDist(url.pathname, '.html')
          ) {
            url.pathname += '.html';
            req.url = `${url.pathname}${url.search}`;
          }
          return next();
        }
        // Leaf page: `/guide/a` serves `/guide/a.html` (GH Pages semantics).
        if (existsInDist(url.pathname, '.html')) {
          url.pathname += '.html';
          req.url = `${url.pathname}${url.search}`;
          next();
          return;
        }
        if (!existsInDist(url.pathname, '/index.html')) return next();
        // Directory URL without the trailing slash. Slash mode mirrors GH
        // Pages (301 to `/guide/`); bare mode mirrors CF Pages (serve the
        // directory index here, no redirect).
        if (bare) {
          url.pathname += '/index.html';
          req.url = `${url.pathname}${url.search}`;
          next();
          return;
        }
        url.pathname += '/';
        previewRedirect(url, res);
      });
    },
    configureServer(server) {
      if (inert) return;
      server.watcher.add(config.contentDir);
      const isContent = (file: string): boolean =>
        isContentFile(file, config.contentDir);
      server.watcher.on('change', (file: string) => {
        if (!isContent(file)) return;
        store.invalidate(file);
        server.ws.send({ type: 'full-reload' });
      });
      // add/unlink events arrive in bursts (git checkout, bulk moves, editor
      // atomic saves); each resync rescans the whole tree, so only the
      // trailing call matters — debounce merges the rest and never swallows
      // the final state (trailing edge).
      const structureResync = debounceTrailing(
        STRUCTURE_DEBOUNCE_MS,
        () =>
          void (async () => {
            await store.resync('dev');
            server.ws.send({ type: 'full-reload' });
          })().catch((e: unknown) => {
            // Without the catch, a resync failure (invalid frontmatter, fs
            // error...) becomes an unhandled rejection and kills the dev
            // server process (Node 15+).
            console.error('[absolute-press] dev resync failed', e);
            const err = e instanceof Error ? e : new Error(String(e));
            server.ws.send({
              type: 'error',
              // vite's ErrorPayload requires a stack string; the message is
              // the best fallback when Error.stack is unavailable.
              err: { message: err.message, stack: err.stack ?? err.message },
            });
          }),
      );
      const onStructure = (file: string): void => {
        if (!isContent(file)) return;
        structureResync.push();
      };
      server.watcher.on('add', onStructure);
      server.watcher.on('unlink', onStructure);
      // Timer cleanup on dev server close. chokidar's close() removes all
      // listeners without emitting 'close', so the http server event is the
      // reliable hook (absent in middleware mode, where the embedding
      // process owns the lifetime and a stray resync is harmless).
      server.httpServer?.once('close', structureResync.cancel);
      // Middleware-served pages bypass vite's HTML transform, so the HMR
      // client never reaches the browser on its own: without this script no
      // page opens the HMR websocket and the full-reload broadcasts above
      // (md edits, structure changes) arrive nowhere.
      const hmrClientTag = `<script type="module" src="${path.posix.join(server.config.base, '@vite/client')}"></script>`;
      const ready = store.sync('dev');
      // Dev FOUC fix: vite serves CSS as JS modules (the style tag only
      // exists after the entry executes), so every MPA navigation paints
      // the raw HTML first. Inject the entry's static CSS as render-blocking
      // `<link ?direct>` (vite serves raw CSS for `?direct` requests), which
      // mirrors the build-time head contract. Serve-only: build output keeps
      // its own head links and must stay untouched.
      let cssLinks: Promise<string> | null = null;
      const devCssLinks = (): Promise<string> =>
        (cssLinks ??= entryCssLinks(server).catch((e: unknown) => {
          // Failures are not cached: a transient transform error must not
          // disable the FOUC fix for the rest of the dev session. Concurrent
          // callers still share the in-flight promise (the catch runs on a
          // later microtask, after cssLinks holds it).
          cssLinks = null;
          console.error('[absolute-press] dev css head injection failed', e);
          return '';
        }));
      return () => {
        server.middlewares.use((req, res, next) => {
          void (async (): Promise<void> => {
            try {
              await ready;
              // Edits that introduced new fence languages rebuild the
              // renderer here (no-op otherwise), so the md-edit full-reload
              // arrives with working highlighting.
              await store.refreshRenderer();
              if (req.method !== 'GET' && req.method !== 'HEAD') {
                next();
                return;
              }
              // Routes are URL-encoded (see routeOf), so compare the raw path.
              const url = (req.url ?? '/').split('?')[0] ?? '/';
              if (url === '/rss.xml') {
                res.setHeader('content-type', 'application/xml; charset=utf-8');
                res.end(store.rss());
                return;
              }
              const html = store.devHtml(url);
              if (html === null) {
                next();
                return;
              }
              res.setHeader('content-type', 'text/html; charset=utf-8');
              const links = await devCssLinks();
              res.end(injectHead(html, `${links}${hmrClientTag}`));
            } catch (e) {
              next(e);
            }
          })();
        });
      };
    },
    generateBundle(_options, bundle) {
      if (inert) return;
      const scriptFile = Object.values(bundle).find(
        c => c.type === 'chunk' && c.isEntry,
      )?.fileName;
      if (!scriptFile) {
        this.error('[absolute-press] client entry chunk not found in bundle');
      }
      const cssFiles = headCssFiles(scriptFile, bundle);
      const files = store.emitAll({ isBuild: true, scriptFile, cssFiles });
      const dead = store.deadLinks();
      if (dead.length > 0) {
        const list = dead
          .map(
            d =>
              `  ${d.file}${d.line === undefined ? '' : `:${d.line}`} -> ${d.raw}`,
          )
          .join('\n');
        this.error(
          `[absolute-press] ${dead.length} dead link(s) found:\n${list}`,
        );
      }
      reportBareLinks(store.bareLinks(), config.strictLinks, this.error);
      for (const file of files) {
        this.emitFile({
          type: 'asset',
          fileName: file.fileName,
          source: file.source,
        });
      }
    },
  };
}

/** 301 to `url` (pathname + search) in the preview middleware. */
function previewRedirect(url: URL, res: ServerResponse): void {
  res.statusCode = 301;
  res.setHeader('location', `${url.pathname}${url.search}`);
  res.end();
}

// Unconditional, not path.sep-based: chokidar and unit fixtures may carry
// either separator style on any platform.
function toPosix(p: string): string {
  return p.replaceAll('\\', '/');
}

/** Build fail hook shape (vite's `this.error`), narrowed for testing. */
type BuildError = (message: string) => never;

/**
 * Trailing debounce: collapse a burst of calls into one run after `delayMs`
 * of quiet. The last push always runs (the pending call is replaced, not
 * dropped), so a burst of structural watcher events still ends in exactly
 * one resync. `cancel` drops the pending call (dev server close cleanup).
 */
export function debounceTrailing(
  delayMs: number,
  fn: () => void,
): { push: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    push(): void {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    cancel(): void {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Apply the site `strictLinks` policy to bare relative markdown links:
 * 'error' fails the build (same format as dead links), 'warn' prints the
 * list and passes, 'off' stays silent.
 */
export function reportBareLinks(
  bare: readonly { file: string; raw: string; line?: number }[],
  policy: 'off' | 'warn' | 'error',
  fail: BuildError,
): void {
  if (policy === 'off' || bare.length === 0) return;
  const list = bare
    .map(
      d => `  ${d.file}${d.line === undefined ? '' : `:${d.line}`} -> ${d.raw}`,
    )
    .join('\n');
  const message =
    `[absolute-press] ${bare.length} bare relative link(s) ` +
    `(not rewritten to .html, outside the dead-link check):\n${list}`;
  if (policy === 'error') {
    fail(
      `${message}\nstrictLinks: 'error' — fix the links or relax the policy.`,
    );
    return;
  }
  console.warn(
    `${message}\n(strictLinks: 'warn' — pass 'off' to silence, 'error' to fail the build)`,
  );
}

/**
 * Watcher-path check for content markdown files. The prefix match must be
 * boundary-aware: a bare startsWith(contentDir) would also fire for sibling
 * directories sharing the name prefix (e.g. `<contentDir>-draft/`), causing
 * needless full resyncs. A root contentDir ('/') keeps its single slash and
 * therefore matches every path.
 */
export function isContentFile(file: string, contentDir: string): boolean {
  // chokidar may emit posix-style paths on Windows; normalize both sides.
  const posix = toPosix(file);
  const root = toPosix(contentDir);
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return posix.startsWith(prefix) && posix.endsWith('.md');
}

/** Static-import specifiers of vite-dev-transformed module code (bare and
 * named forms share one shape after the optional `... from`; the fragment
 * before `from` must stay on one line and quote-free). Dynamic `import(...)`
 * never matches (no leading whitespace + no statement-start quote).
 * Known limits: only double-quoted, single-line statements match — a
 * heuristic over vite's dev output, not a parser. Any miss (or a transform
 * failure in entryCssLinks) only shrinks the collected css set; pages then
 * fall back to vite's runtime style injection and lose just the FOUC fix. */
const DEV_IMPORT_RE = /^\s*import\s+(?:[^"\n]*?from\s+)?"([^"]+)"/gm;

/** CSS urls of one dev-transformed module's static imports. */
function cssUrlsOf(code: string): string[] {
  return [...code.matchAll(DEV_IMPORT_RE)]
    .map(m => m[1])
    .filter((url): url is string => Boolean(url))
    .filter(url => url.endsWith('.css'));
}

/**
 * Collect the entry's statically imported CSS in dev (uno virtual css,
 * theme.css, sidebar.css...) — the same set headCssFiles() puts in the
 * build-time head. Walks the static import graph via transformRequest;
 * dynamic imports (mermaid, photoswipe, docsearch css) are never followed,
 * matching the build contract. Computed once per server lifetime.
 */
async function entryCssLinks(server: ViteDevServer): Promise<string> {
  const urls = new Set<string>();
  const seen = new Set<string>();
  const walk = async (url: string): Promise<void> => {
    if (seen.has(url)) return;
    seen.add(url);
    const mod = await server.transformRequest(url);
    if (!mod) return;
    for (const css of cssUrlsOf(mod.code)) urls.add(css);
    const deps = [...mod.code.matchAll(DEV_IMPORT_RE)]
      .map(m => m[1])
      .filter((dep): dep is string => Boolean(dep))
      .filter(dep => !dep.endsWith('.css') && isAppModuleUrl(dep));
    await Promise.all(deps.map(walk));
  };
  await walk(devFsUrl(clientEntry()));
  return [...urls]
    .map(u => `<link rel="stylesheet" href="${u}?direct">`)
    .join('');
}

/** Insert markup before the first `</head>`; no-op when head is absent. */
function injectHead(html: string, markup: string): string {
  const at = html.indexOf('</head>');
  return at === -1 ? html : `${html.slice(0, at)}${markup}${html.slice(at)}`;
}

/** Minimal structural view of the bundle output; vite's rollup type
 * re-exports differ across rolldown-vite versions. */
interface BundleChunk {
  type: 'chunk';
  fileName: string;
}

interface BundleAsset {
  type: 'asset';
  fileName: string;
}

/**
 * CSS of the entry chunk's static import graph only — the sole set that
 * belongs in every page head as render-blocking links. CSS of dynamic chunks
 * (docsearch, photoswipe, mermaid, G2Plot...) is injected on demand by Vite's
 * preload runtime; injecting it into every head instead used to add ~50KB of
 * render-blocking bytes per page and widen the navigation flash window.
 *
 * rolldown-vite attaches this graph metadata to the chunk under a minified
 * key, so locate the metadata holder structurally. If a future bundler drops
 * it, fall back to "every css asset" — correct for styling, only heavier.
 */
function headCssFiles(
  scriptFile: string,
  bundle: Record<string, BundleChunk | BundleAsset>,
): string[] {
  const all = Object.values(bundle)
    .filter((a): a is BundleAsset => a.type === 'asset')
    .map(a => a.fileName)
    .filter(name => name.endsWith('.css'));
  const entry = Object.values(bundle).find(
    (c): c is BundleChunk => c.type === 'chunk' && c.fileName === scriptFile,
  );
  if (!entry) return all;
  for (const value of Object.values(entry)) {
    if (value === null || typeof value !== 'object') continue;
    const css = (value as { importedCss?: unknown }).importedCss;
    if (css instanceof Set) {
      return [...css].filter(name => all.includes(name));
    }
  }
  return all;
}

/** Dev needs /@fs/ URLs; build resolves absolute fs paths directly. */
function islandSpecifier(mod: string, isBuild: boolean): string {
  return isBuild ? toPosix(mod) : devFsUrl(mod);
}

/**
 * Dev-serving allow list for the framework package: linked installs keep it
 * outside the consumer project, and the client entry, theme css and katex
 * assets are all served from there via /@fs/. Vite applies its
 * searchForWorkspaceRoot default only when fs.allow is unset, so an absent
 * user list gets the default re-added here; explicit user entries stay
 * untouched (this list is concatenated onto theirs).
 */
/** Root must be the vite-resolved project root, not the process cwd. */
function devFsAllow(cfg: UserConfig, root: string): string[] {
  const base = cfg.server?.fs?.allow ? [] : [searchForWorkspaceRoot(root)];
  return [...base, packageRoot()];
}

/**
 * Dev import specifier of an app module: root-relative (project root ==
 * package root) or /@fs/ absolute (linked installs, files under the
 * package's src/). Vendored packages are never followed: their css is
 * linked by the shell (katex) or injected on demand (docsearch,
 * photoswipe), and optimized deps live in the consumer's .vite cache.
 */
function isAppModuleUrl(dep: string): boolean {
  if (dep.startsWith('/src/')) return true;
  const fsPath = fsPathOfDevUrl(dep);
  return fsPath !== null && fsPath.startsWith(APP_SRC_PREFIX);
}

/** Reverse of devFsUrl for package-external files: '/@fs/C:/x' and
 * '/@fs/C:/x?query' both resolve to the posix fs path. */
function fsPathOfDevUrl(url: string): string | null {
  if (!url.startsWith('/@fs/')) return null;
  let p = url.slice('/@fs/'.length);
  const query = p.indexOf('?');
  if (query !== -1) p = p.slice(0, query);
  try {
    p = decodeURIComponent(p);
  } catch {
    return null;
  }
  // Posix URLs keep the leading slash after the prefix; Windows drive
  // letters arrive without one ('/@fs/C:/x' -> 'C:/x').
  if (!/^[A-Za-z]:/.test(p)) p = `/${p}`;
  return toPosix(p);
}

interface WebAlias {
  find: RegExp;
  replacement: string;
}

/** Subset of @solidjs/web's package.json the alias needs. */
interface WebPackageJson {
  exports?: {
    '.'?: {
      browser?: {
        development?: { default?: string };
        default?: string;
      };
    };
  };
  unpkg?: string;
}

/**
 * Alias @solidjs/web to a resolvable location. It is a direct dependency
 * now, but older installs only had it nested under @solidjs/vite-plugin
 * (pnpm does not hoist) — resolve directly first, then walk the chain.
 *
 * The alias must land on the browser entry FILE, not the package root:
 * a directory alias bypasses the exports map and resolves through
 * mainFields, where `module` points at the SSR build (./dist/server.js).
 * The client bundle then throws "Client-only API called on the server
 * side" at load and no theme chrome mounts. Pick the browser(.development)
 * branch out of the exports map instead; `unpkg` is the legacy fallback
 * and the package root the last resort (the old, broken behavior).
 */
function solidWebAlias(dev: boolean, root: string): WebAlias[] {
  const target = (req: ReturnType<typeof createRequire>): string | null => {
    try {
      const pkgJsonPath = req.resolve('@solidjs/web/package.json');
      const pkgDir = path.dirname(pkgJsonPath);
      const pkgJson = JSON.parse(
        fs.readFileSync(pkgJsonPath, 'utf8'),
      ) as WebPackageJson;
      const browser = pkgJson.exports?.['.']?.browser;
      const rel =
        (dev ? browser?.development?.default : browser?.default) ??
        pkgJson.unpkg;
      return path.join(pkgDir, rel ?? '.');
    } catch {
      return null;
    }
  };
  try {
    const rootReq = createRequire(path.resolve(root, 'package.json'));
    const resolved = target(rootReq);
    if (resolved) return [{ find: /^@solidjs\/web$/, replacement: resolved }];
  } catch {
    // fall through to the transitive-dependency chain
  }
  try {
    // Resolve from the solid plugin's own dependency chain (legacy pnpm
    // layouts where @solidjs/web is not hoisted to the workspace root).
    const pluginEntry = fs.realpathSync(
      path.resolve(root, 'node_modules/vite-plugin-solid/index.mjs'),
    );
    const resolved = target(createRequire(pluginEntry));
    if (resolved) return [{ find: /^@solidjs\/web$/, replacement: resolved }];
  } catch {
    return [];
  }
  return [];
}
