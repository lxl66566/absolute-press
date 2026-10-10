import type { ArticleInfo, LocaleInfo } from '../../shared/types.ts';
import type { PageSource } from './pages.ts';

/** One synthetic archive page: `/category/<name>` or `/tag/<name>`. */
export interface ArchivePage {
  route: string;
  title: string;
  locale: LocaleInfo;
  /** Which aggregation produced this page; used in conflict errors. */
  kind: 'category' | 'tag';
  articles: ArticleInfo[];
}

/** Route-collision view of one synthetic (non-content) page: an archive or
 * a built-in listing page (config `pages`). */
export interface SyntheticRoute {
  route: string;
  kind: 'category' | 'tag' | 'timeline' | 'categories' | 'tags';
  title: string;
}

/** One archive group after case-insensitive name merging. */
export interface ArchiveGroup {
  /** Display name; also used in the archive route. */
  name: string;
  articles: ArticleInfo[];
}

/**
 * Group articles by tag/category, merging names that differ only in case
 * (`Linux` + `linux`): case-insensitive file systems would otherwise emit
 * conflicting archive files. The display/route casing is the most frequent
 * original variant (ties: first seen); articles are deduped by route.
 * Groups are sorted by lowercase key so emit order is deterministic.
 */
export function groupArchiveArticles(
  articles: ArticleInfo[],
  kind: 'category' | 'tag',
): ArchiveGroup[] {
  interface Group {
    /** Original casing -> article count, in first-seen order. */
    variants: Map<string, number>;
    seen: Set<string>;
    articles: ArticleInfo[];
  }
  const groups = new Map<string, Group>();
  for (const a of articles) {
    for (const name of kind === 'category' ? a.category : a.tag) {
      const key = name.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = { variants: new Map(), seen: new Set(), articles: [] };
        groups.set(key, group);
      }
      group.variants.set(name, (group.variants.get(name) ?? 0) + 1);
      // An article carrying both casings (e.g. tags `Linux` and `linux`)
      // must not appear twice in the merged archive.
      if (!group.seen.has(a.route)) {
        group.seen.add(a.route);
        group.articles.push(a);
      }
    }
  }
  return [...groups.entries()]
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, group]) => ({
      name: majorityCasing(group.variants),
      articles: group.articles,
    }));
}

/** Most frequent casing wins; ties keep the first-seen variant. */
function majorityCasing(variants: Map<string, number>): string {
  let best = '';
  let count = -1;
  for (const [name, n] of variants) {
    if (n > count) {
      best = name;
      count = n;
    }
  }
  return best;
}

/**
 * Synthetic routes must not collide with a page route or each other:
 * e.g. `content/category/foo.md` maps to the same `/category/foo` as
 * the `foo` category archive, `content/timeline/index.md` maps to the
 * built-in `/timeline/`. Without this check the failure only surfaces
 * later as a duplicate emitFile name, far from the content that caused it.
 */
export function assertNoSyntheticCollisions(
  pages: PageSource[],
  synthetic: SyntheticRoute[],
): void {
  const label = (p: SyntheticRoute): string =>
    p.kind === 'category' || p.kind === 'tag'
      ? `${p.kind} archive "${p.title}"`
      : `${p.kind} listing "${p.title}"`;
  const fileByRoute = new Map(pages.map(p => [p.route, p.filePath]));
  const firstByRoute = new Map<string, SyntheticRoute>();
  for (const page of synthetic) {
    const file = fileByRoute.get(page.route);
    if (file) {
      throw new Error(
        `[absolute-press] duplicate route ${page.route}: ${label(page)} and page ${file} both map to it`,
      );
    }
    const first = firstByRoute.get(page.route);
    if (first) {
      throw new Error(
        `[absolute-press] duplicate route ${page.route}: ${label(first)} and ${label(page)} both map to it`,
      );
    }
    firstByRoute.set(page.route, page);
  }
}
