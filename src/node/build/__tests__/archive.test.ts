import { describe, expect, it } from 'vitest';

import type { ArticleInfo, LocaleInfo } from '../../../shared/types.ts';
import {
  assertNoArchiveCollisions,
  groupArchiveArticles,
  type ArchivePage,
} from '../archive.ts';
import type { PageSource } from '../pages.ts';

function article(
  route: string,
  tag: string[],
  category: string[] = [],
): ArticleInfo {
  return {
    route,
    title: route,
    createdAt: null,
    updatedAt: null,
    category,
    tag,
  };
}

const LOCALE: LocaleInfo = {
  key: '',
  lang: 'zh-CN',
  label: '',
  prefix: '',
};

function page(route: string, relPath: string): PageSource {
  return {
    filePath: `/content/${relPath}`,
    locale: LOCALE,
    relPath,
    route,
  };
}

function archive(
  route: string,
  kind: 'category' | 'tag',
  title: string,
): ArchivePage {
  return { route, title, locale: LOCALE, kind, articles: [] };
}

describe('groupArchiveArticles', () => {
  it('merges names differing only in case and dedupes articles', () => {
    const groups = groupArchiveArticles(
      [
        article('/a', ['Linux']),
        article('/b', ['linux']),
        // Both casings on one article: counted per variant, listed once.
        article('/c', ['Linux', 'linux']),
      ],
      'tag',
    );
    expect(groups).toHaveLength(1);
    // `Linux` appears twice, `linux` twice -> tie, first seen wins.
    expect(groups[0]?.name).toBe('Linux');
    expect(groups[0]?.articles.map(a => a.route)).toEqual(['/a', '/b', '/c']);
  });

  it('picks the most frequent casing as the display name', () => {
    const groups = groupArchiveArticles(
      [
        article('/a', ['linux']),
        article('/b', ['Linux']),
        article('/c', ['Linux']),
      ],
      'tag',
    );
    expect(groups[0]?.name).toBe('Linux');
    expect(groups[0]?.articles).toHaveLength(3);
  });

  it('keeps distinct names as separate groups in deterministic order', () => {
    const groups = groupArchiveArticles(
      [article('/a', ['Rust', 'Linux']), article('/b', ['linux'])],
      'tag',
    );
    expect(groups.map(g => g.name)).toEqual(['Linux', 'Rust']);
  });

  it('groups categories the same way', () => {
    const groups = groupArchiveArticles(
      [article('/a', [], ['Coding']), article('/b', [], ['coding'])],
      'category',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.articles).toHaveLength(2);
  });
});

describe('assertNoArchiveCollisions', () => {
  it('fails when an archive route collides with a page route', () => {
    expect(() =>
      assertNoArchiveCollisions(
        [page('/category/foo', 'category/foo.md')],
        [archive('/category/foo', 'category', 'foo')],
      ),
    ).toThrow(
      /duplicate route \/category\/foo: category archive "foo" and page \/content\/category\/foo\.md both map to it/,
    );
  });

  it('fails when two archives share a route', () => {
    expect(() =>
      assertNoArchiveCollisions(
        [],
        [archive('/tag/x', 'tag', 'x'), archive('/tag/x', 'tag', 'X')],
      ),
    ).toThrow(
      /duplicate route \/tag\/x: tag archive "x" and tag archive "X" both map to it/,
    );
  });

  it('passes on distinct routes', () => {
    expect(() =>
      assertNoArchiveCollisions(
        [page('/blog/foo', 'blog/foo.md')],
        [
          archive('/category/foo', 'category', 'foo'),
          archive('/tag/foo', 'tag', 'foo'),
        ],
      ),
    ).not.toThrow();
  });

  // Exact-match semantics, mirroring assertUniqueRoutes: same-route casing
  // variants inside archives are merged earlier by groupArchiveArticles.
  it('treats routes differing only in case as distinct', () => {
    expect(() =>
      assertNoArchiveCollisions(
        [page('/category/foo', 'category/foo.md')],
        [archive('/category/Foo', 'category', 'Foo')],
      ),
    ).not.toThrow();
  });
});
