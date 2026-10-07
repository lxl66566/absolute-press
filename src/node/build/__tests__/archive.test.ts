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
        article('/a.html', ['Linux']),
        article('/b.html', ['linux']),
        // Both casings on one article: counted per variant, listed once.
        article('/c.html', ['Linux', 'linux']),
      ],
      'tag',
    );
    expect(groups).toHaveLength(1);
    // `Linux` appears twice, `linux` twice -> tie, first seen wins.
    expect(groups[0]?.name).toBe('Linux');
    expect(groups[0]?.articles.map(a => a.route)).toEqual([
      '/a.html',
      '/b.html',
      '/c.html',
    ]);
  });

  it('picks the most frequent casing as the display name', () => {
    const groups = groupArchiveArticles(
      [
        article('/a.html', ['linux']),
        article('/b.html', ['Linux']),
        article('/c.html', ['Linux']),
      ],
      'tag',
    );
    expect(groups[0]?.name).toBe('Linux');
    expect(groups[0]?.articles).toHaveLength(3);
  });

  it('keeps distinct names as separate groups in deterministic order', () => {
    const groups = groupArchiveArticles(
      [article('/a.html', ['Rust', 'Linux']), article('/b.html', ['linux'])],
      'tag',
    );
    expect(groups.map(g => g.name)).toEqual(['Linux', 'Rust']);
  });

  it('groups categories the same way', () => {
    const groups = groupArchiveArticles(
      [article('/a.html', [], ['Coding']), article('/b.html', [], ['coding'])],
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
        [page('/category/foo.html', 'category/foo.md')],
        [archive('/category/foo.html', 'category', 'foo')],
      ),
    ).toThrow(
      /duplicate route \/category\/foo\.html: category archive "foo" and page \/content\/category\/foo\.md both map to it/,
    );
  });

  it('fails when two archives share a route', () => {
    expect(() =>
      assertNoArchiveCollisions(
        [],
        [
          archive('/tag/x.html', 'tag', 'x'),
          archive('/tag/x.html', 'tag', 'X'),
        ],
      ),
    ).toThrow(
      /duplicate route \/tag\/x\.html: tag archive "x" and tag archive "X" both map to it/,
    );
  });

  it('passes on distinct routes', () => {
    expect(() =>
      assertNoArchiveCollisions(
        [page('/blog/foo.html', 'blog/foo.md')],
        [
          archive('/category/foo.html', 'category', 'foo'),
          archive('/tag/foo.html', 'tag', 'foo'),
        ],
      ),
    ).not.toThrow();
  });

  // Exact-match semantics, mirroring assertUniqueRoutes: same-route casing
  // variants inside archives are merged earlier by groupArchiveArticles.
  it('treats routes differing only in case as distinct', () => {
    expect(() =>
      assertNoArchiveCollisions(
        [page('/category/foo.html', 'category/foo.md')],
        [archive('/category/Foo.html', 'category', 'Foo')],
      ),
    ).not.toThrow();
  });
});
