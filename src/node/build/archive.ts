import type { ArticleInfo, LocaleInfo } from '../../shared/types.ts';
import type { PageSource } from './pages.ts';

/** One synthetic archive page: `/category/<name>.html` or `/tag/<name>.html`. */
export interface ArchivePage {
  route: string;
  title: string;
  locale: LocaleInfo;
  /** Which aggregation produced this page; used in conflict errors. */
  kind: 'category' | 'tag';
  articles: ArticleInfo[];
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
 * Archive routes must not collide with a page route or another archive:
 * e.g. `content/category/foo.md` maps to the same `/category/foo.html` as
 * the `foo` category archive. Without this check the failure only surfaces
 * later as a duplicate emitFile name, far from the content that caused it.
 */
export function assertNoArchiveCollisions(
  pages: PageSource[],
  archives: ArchivePage[],
): void {
  const fileByRoute = new Map(pages.map(p => [p.route, p.filePath]));
  const firstByRoute = new Map<string, ArchivePage>();
  for (const archive of archives) {
    const file = fileByRoute.get(archive.route);
    if (file) {
      throw new Error(
        `[absolute-press] duplicate route ${archive.route}: ${archive.kind} archive "${archive.title}" and page ${file} both map to it`,
      );
    }
    const first = firstByRoute.get(archive.route);
    if (first) {
      throw new Error(
        `[absolute-press] duplicate route ${archive.route}: ${first.kind} archive "${first.title}" and ${archive.kind} archive "${archive.title}" both map to it`,
      );
    }
    firstByRoute.set(archive.route, archive);
  }
}
