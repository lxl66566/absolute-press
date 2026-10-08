import fs from 'node:fs';
import path from 'node:path';

import { glob } from 'tinyglobby';

import type {
  ArticleInfo,
  DirectoryIndex,
  LocaleInfo,
  PageMeta,
} from '../../shared/types.ts';
import type { ResolvedConfig } from '../config.ts';
import { normalizeRouteForMatch } from './route-match.ts';

/** A markdown file discovered on disk, before rendering. */
export interface PageSource {
  /** Absolute file path. */
  filePath: string;
  locale: LocaleInfo;
  /** Path relative to the locale content root, posix separators. */
  relPath: string;
  /** Locale-prefixed clean route, e.g. `/guide/a`, `/guide/`, `/en/`. */
  route: string;
}

/** PageSource after markdown rendering. */
export interface RenderedPage extends PageSource {
  meta: PageMeta;
}

/** Stems that denote their directory's index page. */
export const INDEX_STEMS: ReadonlySet<string> = new Set(['index', 'README']);

/**
 * `guide/getting-started.md` -> `/guide/getting-started`; `index.md` and
 * `README.md` map to their directory's index route (VuePress semantics,
 * mirrored by LinkResolver's index/README candidates): `/guide/` in
 * `directoryIndex: 'slash'` mode, `/guide` in 'bare' mode; the root index
 * is `/` in both.
 */
export function routeOf(
  relPath: string,
  prefix: string,
  directoryIndex: DirectoryIndex,
): string {
  const noExt = relPath.replace(/\.md$/, '');
  const slash = noExt.lastIndexOf('/');
  const stem = noExt.slice(slash + 1);
  const dir = noExt.slice(0, slash + 1); // '' or a trailing-slash directory
  const routePath = INDEX_STEMS.has(stem)
    ? directoryIndex === 'bare' && dir !== ''
      ? dir.slice(0, -1)
      : dir
    : noExt;
  // Segments are URL-encoded so routes match request URLs in dev and in hrefs.
  return `${prefix}/${routePath}`
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/');
}

/**
 * Page-relative href from one route to another, resolved by the browser
 * against the source page's URL directory (the route up to its last '/').
 * Trailing slashes of slash-mode directory indexes must survive — `/guide/`
 * and `/guide` are different routes there — and the source's own directory
 * index is `./` in slash mode but `../<dir>` in bare mode ('./' would cost a
 * Cloudflare Pages redirect to the bare canonical).
 */
export function relativeRoute(fromRoute: string, toRoute: string): string {
  const base = fromRoute.slice(0, fromRoute.lastIndexOf('/') + 1);
  // `base` ends with '/', so a prefix match is always segment-aligned.
  if (toRoute.startsWith(base)) {
    const down = toRoute.slice(base.length);
    return down === '' ? './' : down;
  }
  const baseSegs = base.split('/').filter(Boolean);
  const trailing = toRoute.endsWith('/');
  const toSegs = toRoute.split('/').filter(Boolean);
  let common = 0;
  while (
    common < baseSegs.length &&
    common < toSegs.length &&
    baseSegs[common] === toSegs[common]
  ) {
    common++;
  }
  const ups = '../'.repeat(baseSegs.length - common);
  const down = toSegs.slice(common).join('/');
  if (down !== '') return `${ups}${down}${trailing ? '/' : ''}`;
  if (ups !== '') return ups;
  // The target is the source's own directory: slash mode's `/guide/` is
  // './'; bare mode's `/guide` needs '../guide' ('./' resolves to '/guide/').
  return toRoute === base ? './' : `../${baseSegs[baseSegs.length - 1] ?? ''}`;
}

/**
 * Route (URL-encoded) -> emitted file name. Static hosts decode the request
 * path before file lookup, so files must be written with decoded segment
 * names: `tag/%E4%B8%BB%E9%A2%98.html` on disk would 404 for the URL
 * `/tag/%E4%B8%BB%E9%A2%98` (lookup key `tag/主题.html`).
 *
 * Bare-mode directory indexes (`/guide`) share the extensionless route form
 * with leaf pages, so callers pass `index: true` for directory-index routes
 * to pick the `index.html` file shape. (Both mapping to one route is a
 * build error — see assertUniqueRoutes — so the flag can never pick wrong.)
 */
export function routeToFileName(
  route: string,
  directoryIndex: DirectoryIndex,
  index = false,
): string {
  const decoded = route
    .split('/')
    .map(seg => decodeURIComponent(seg))
    .join('/');
  if (decoded.endsWith('/')) return `${decoded}index.html`;
  if (directoryIndex === 'bare' && index) return `${decoded}/index.html`;
  return `${decoded}.html`;
}

/** Last segment of a content-relative path without the `.md` extension. */
export function stemOf(relPath: string): string {
  return relPath.slice(relPath.lastIndexOf('/') + 1).replace(/\.md$/, '');
}

export function isLocaleHome(page: PageSource): boolean {
  return !page.relPath.includes('/') && INDEX_STEMS.has(stemOf(page.relPath));
}

/** Scan contentDir; default locale at root, extra locales in `<contentDir>/<key>/`. */
export async function scanPages(config: ResolvedConfig): Promise<PageSource[]> {
  const extraKeys = config.locales.slice(1).map(l => l.key);
  const perLocale = await Promise.all(
    config.locales.map(async (locale): Promise<PageSource[]> => {
      const dir =
        locale.prefix === ''
          ? config.contentDir
          : path.join(config.contentDir, locale.key);
      if (!fs.existsSync(dir)) {
        // A typo'd contentDir would otherwise silently build/dev an empty
        // site, so fail on the default locale's folder. Extra locale dirs
        // stay optional: not writing a locale's content is legal.
        if (locale.prefix === '') {
          throw new Error(
            `[absolute-press] contentDir does not exist: ${dir} — fix the 'contentDir' option or create the folder`,
          );
        }
        return [];
      }
      let files = await glob('**/*.md', { cwd: dir });
      if (locale.prefix === '' && extraKeys.length > 0) {
        // Locale dirs belong to their own locale, not the default one.
        files = files.filter(
          f => !extraKeys.some(k => f === `${k}.md` || f.startsWith(`${k}/`)),
        );
      }
      // The term-refs directory holds popover articles, not pages (the refs
      // scan owns it); excluded from every locale's walk.
      if (config.refs) {
        files = files.filter(f => !f.startsWith(`${config.refs}/`));
      }
      return files.toSorted().map(relPath => ({
        filePath: path.join(dir, relPath),
        locale,
        relPath,
        route: routeOf(relPath, locale.prefix, config.urls.directoryIndex),
      }));
    }),
  );
  const pages = perLocale.flat();
  assertUniqueRoutes(pages);
  return pages;
}

/**
 * Distinct files may normalize to one route (e.g. `dir/index.md` next to
 * `dir/README.md`); fail with both file paths instead of letting one page
 * silently shadow the other in byRoute lookups and bundle emission.
 */
export function assertUniqueRoutes(pages: PageSource[]): void {
  const firstByRoute = new Map<string, PageSource>();
  for (const page of pages) {
    const first = firstByRoute.get(page.route);
    if (first) {
      throw new Error(
        `[absolute-press] duplicate route ${page.route}: ${first.filePath} and ${page.filePath} both map to it`,
      );
    }
    firstByRoute.set(page.route, page);
  }
}

/**
 * Route-prefix match against navExclude. Both sides run through
 * normalizeRouteForMatch: decoded segments and collapsed slashes, so plain
 * unencoded prefixes match encoded routes.
 */
export function isNavExcluded(route: string, navExclude: string[]): boolean {
  const normalized = normalizeRouteForMatch(route);
  return navExclude.some(p => {
    const prefix = normalizeRouteForMatch(p);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

/** Home feed / archive entries, sorted by date desc (null last). */
export function buildArticles(pages: RenderedPage[]): ArticleInfo[] {
  return pages
    .filter(p => !isLocaleHome(p))
    .map(p => ({
      route: p.route,
      title: p.meta.title || p.relPath.replace(/\.md$/, ''),
      ...(p.meta.frontmatter.icon ? { icon: p.meta.frontmatter.icon } : {}),
      createdAt: p.meta.createdAt,
      updatedAt: p.meta.updatedAt,
      category: p.meta.frontmatter.category ?? [],
      tag: p.meta.frontmatter.tag ?? [],
    }))
    .toSorted((a, b) => {
      if (a.createdAt && b.createdAt) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
      return a.route.localeCompare(b.route);
    });
}
