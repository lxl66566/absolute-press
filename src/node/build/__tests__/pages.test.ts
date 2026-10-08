import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import type { LocaleInfo, PageMeta } from '../../../shared/types.ts';
import { resolveConfig } from '../../config.ts';
import {
  assertUniqueRoutes,
  buildArticles,
  INDEX_STEMS,
  isLocaleHome,
  isNavExcluded,
  relativeRoute,
  routeOf,
  routeToFileName,
  scanPages,
  stemOf,
} from '../pages.ts';
import type { PageSource, RenderedPage } from '../pages.ts';

const LOCALE: LocaleInfo = { key: '', lang: 'zh-CN', label: 'zh', prefix: '' };

function page(rel: string, route: string): PageSource {
  return {
    filePath: `/site/content/${rel}`,
    locale: LOCALE,
    relPath: rel,
    route,
  };
}

function rendered(rel: string, meta: Partial<PageMeta>): RenderedPage {
  return {
    ...page(rel, routeOf(rel, '', 'slash')),
    meta: {
      route: routeOf(rel, '', 'slash'),
      locale: LOCALE.key,
      title: '',
      headings: [],
      frontmatter: {},
      createdAt: null,
      updatedAt: null,
      ...meta,
    },
  };
}

describe('routeOf', () => {
  it('maps leaf pages to extensionless routes', () => {
    expect(routeOf('guide/getting-started.md', '', 'slash')).toBe(
      '/guide/getting-started',
    );
    expect(routeOf('guide/getting-started.md', '', 'bare')).toBe(
      '/guide/getting-started',
    );
    expect(routeOf('about.md', '/en', 'slash')).toBe('/en/about');
  });

  it('maps index and README.md to the trailing-slash directory route', () => {
    expect(routeOf('index.md', '', 'slash')).toBe('/');
    expect(routeOf('guide/index.md', '', 'slash')).toBe('/guide/');
    expect(routeOf('index.md', '/en', 'slash')).toBe('/en/');
    expect(routeOf('learning/README.md', '', 'slash')).toBe('/learning/');
    expect(routeOf('hobbies/other_games/README.md', '', 'slash')).toBe(
      '/hobbies/other_games/',
    );
    expect(routeOf('README.md', '/en', 'slash')).toBe('/en/');
  });

  it('maps directory indexes to the bare route in bare mode (root stays /)', () => {
    expect(routeOf('index.md', '', 'bare')).toBe('/');
    expect(routeOf('guide/index.md', '', 'bare')).toBe('/guide');
    expect(routeOf('guide/README.md', '', 'bare')).toBe('/guide');
    expect(routeOf('index.md', '/en', 'bare')).toBe('/en/');
    expect(routeOf('hobbies/other_games/README.md', '', 'bare')).toBe(
      '/hobbies/other_games',
    );
  });

  it('percent-encodes non-ASCII segments', () => {
    expect(routeOf('标签/主题.md', '', 'slash')).toBe(
      '/%E6%A0%87%E7%AD%BE/%E4%B8%BB%E9%A2%98',
    );
  });
});

describe('relativeRoute', () => {
  it('links siblings and children with plain segments', () => {
    expect(relativeRoute('/guide/a', '/guide/b')).toBe('b');
    expect(relativeRoute('/guide/', '/guide/a')).toBe('a');
    expect(relativeRoute('/', '/guide/a')).toBe('guide/a');
    expect(relativeRoute('/guide/', '/guide/sub/')).toBe('sub/');
  });

  it('links upwards with .. segments, keeping the target trailing slash', () => {
    expect(relativeRoute('/guide/a', '/other/b')).toBe('../other/b');
    expect(relativeRoute('/guide/sub/', '/other/')).toBe('../../other/');
    expect(relativeRoute('/en/', '/')).toBe('../');
    expect(relativeRoute('/guide/a', '/')).toBe('../');
  });

  it('links a page to its own directory index', () => {
    // Slash mode: '/guide/' from '/guide/a'.
    expect(relativeRoute('/guide/a', '/guide/')).toBe('./');
    // Bare mode: '/guide' from '/guide/a' ('./' would resolve to '/guide/').
    expect(relativeRoute('/guide/a', '/guide')).toBe('../guide');
  });

  it('never returns an empty href for a self link', () => {
    expect(relativeRoute('/guide/a', '/guide/a')).toBe('a');
    expect(relativeRoute('/guide/', '/guide/')).toBe('./');
    expect(relativeRoute('/', '/')).toBe('./');
  });
});

describe('isNavExcluded', () => {
  it('prefix-matches routes, but not partial segment names', () => {
    expect(isNavExcluded('/guide/x', ['/guide'])).toBe(true);
    expect(isNavExcluded('/guide', ['/guide'])).toBe(true);
    expect(isNavExcluded('/guides/x', ['/guide'])).toBe(false);
    expect(isNavExcluded('/other', [])).toBe(false);
  });

  it('matches unencoded CJK prefixes against encoded routes', () => {
    const route = routeOf('标签/主题.md', '', 'slash');
    expect(route).toBe('/%E6%A0%87%E7%AD%BE/%E4%B8%BB%E9%A2%98');
    expect(isNavExcluded(route, ['/标签'])).toBe(true);
    expect(isNavExcluded(route, ['/其他'])).toBe(false);
  });

  it('stays compatible with legacy percent-encoded prefixes', () => {
    const route = routeOf('标签/主题.md', '', 'slash');
    expect(isNavExcluded(route, ['/%E6%A0%87%E7%AD%BE'])).toBe(true);
  });

  it('collapses duplicate and trailing slashes on both sides', () => {
    expect(isNavExcluded('//guide//x', ['guide/'])).toBe(true);
    expect(isNavExcluded('/guide/x', ['//guide//'])).toBe(true);
  });
});

describe('assertUniqueRoutes', () => {
  it('rejects index.md and README.md normalizing to one route', () => {
    const pages = [
      page('guide/index.md', routeOf('guide/index.md', '', 'slash')),
      page('guide/README.md', routeOf('guide/README.md', '', 'slash')),
    ];
    expect(() => assertUniqueRoutes(pages)).toThrowError(
      /duplicate route \/guide\/: .*guide\/index\.md and .*guide\/README\.md both map to it/,
    );
  });

  it('rejects a leaf page colliding with a bare-mode directory index', () => {
    const pages = [
      page('guide.md', routeOf('guide.md', '', 'bare')),
      page('guide/index.md', routeOf('guide/index.md', '', 'bare')),
    ];
    expect(() => assertUniqueRoutes(pages)).toThrowError(
      /duplicate route \/guide: /,
    );
  });

  it('rejects any duplicate normalized route with both file paths', () => {
    const pages = [page('a.md', '/dup'), page('b.md', '/dup')];
    expect(() => assertUniqueRoutes(pages)).toThrowError(
      /duplicate route \/dup: .*a\.md and .*b\.md both map to it/,
    );
  });

  it('accepts distinct routes', () => {
    const pages = [
      page('README.md', routeOf('README.md', '', 'slash')),
      page('index.md', routeOf('index.md', '/en', 'slash')),
      page('guide/index.md', routeOf('guide/index.md', '', 'slash')),
    ];
    expect(() => assertUniqueRoutes(pages)).not.toThrow();
  });
});

describe('routeToFileName', () => {
  it('maps clean routes back to the on-disk .html names', () => {
    expect(routeToFileName('/', 'slash')).toBe('/index.html');
    expect(routeToFileName('/guide/getting-started', 'slash')).toBe(
      '/guide/getting-started.html',
    );
    expect(routeToFileName('/guide/', 'slash')).toBe('/guide/index.html');
    expect(routeToFileName('/tag/%E4%B8%BB%E9%A2%98', 'slash')).toBe(
      '/tag/主题.html',
    );
    expect(routeToFileName('/category/%E6%8C%87%E5%8D%97', 'slash')).toBe(
      '/category/指南.html',
    );
  });

  it('disambiguates bare-mode directory indexes via the index flag', () => {
    expect(routeToFileName('/guide', 'bare', true)).toBe('/guide/index.html');
    expect(routeToFileName('/guide', 'bare')).toBe('/guide.html');
    expect(routeToFileName('/', 'bare', true)).toBe('/index.html');
    // The index flag is meaningless under slash mode (indexes end with '/').
    expect(routeToFileName('/guide', 'slash', true)).toBe('/guide.html');
  });

  it('is the exact inverse of routeOf for cjk paths', () => {
    const route = routeOf('标签/主题.md', '/en', 'slash');
    expect(routeToFileName(route, 'slash')).toBe('/en/标签/主题.html');
  });

  it('round-trips both directory-index modes', () => {
    expect(
      routeToFileName(routeOf('guide/index.md', '', 'slash'), 'slash'),
    ).toBe('/guide/index.html');
    expect(
      routeToFileName(routeOf('guide/index.md', '', 'bare'), 'bare', true),
    ).toBe('/guide/index.html');
  });
});

describe('stemOf', () => {
  it('strips the .md extension of the last segment', () => {
    expect(stemOf('a.md')).toBe('a');
    expect(stemOf('guide/getting-started.md')).toBe('getting-started');
    expect(stemOf('guide/README.md')).toBe('README');
  });

  it('keeps non-md stems intact', () => {
    expect(stemOf('guide/a.txt')).toBe('a.txt');
    expect(stemOf('a')).toBe('a');
  });
});

describe('INDEX_STEMS', () => {
  it('contains exactly the vuepress index stems', () => {
    expect([...INDEX_STEMS].toSorted()).toEqual(['README', 'index']);
  });
});

describe('isLocaleHome', () => {
  it('is true only for root-level index stems', () => {
    expect(isLocaleHome(page('index.md', '/'))).toBe(true);
    expect(isLocaleHome(page('README.md', '/'))).toBe(true);
    // Nested index pages are directory indexes, not the locale home.
    expect(isLocaleHome(page('guide/index.md', '/guide/'))).toBe(false);
    expect(isLocaleHome(page('about.md', '/about'))).toBe(false);
  });
});

describe('buildArticles', () => {
  it('sorts by date desc, drops the locale home and fills defaults', () => {
    const articles = buildArticles([
      rendered('b.md', { createdAt: '2024-01-01T00:00:00.000Z' }),
      rendered('a.md', {
        createdAt: '2024-02-01T00:00:00.000Z',
        title: 'A',
        frontmatter: { category: ['news'], tag: ['x'], icon: 'star' },
      }),
      rendered('README.md', { createdAt: '2024-03-01T00:00:00.000Z' }),
      rendered('c.md', {}),
      rendered('d.md', {}),
    ]);
    expect(articles.map(a => a.route)).toEqual([
      '/a',
      '/b',
      // Undated pages sink to the sort end in route order.
      '/c',
      '/d',
    ]);
    const a = articles[0];
    expect(a?.title).toBe('A');
    expect(a?.category).toEqual(['news']);
    expect(a?.tag).toEqual(['x']);
    expect(a?.icon).toBe('star');
    // Title falls back to the extension-less rel path.
    expect(articles[2]?.title).toBe('c');
  });
});

describe('scanPages', () => {
  const tmpDirs: string[] = [];
  afterAll(async () => {
    await Promise.all(
      tmpDirs.map(dir => rm(dir, { recursive: true, force: true })),
    );
  });

  /** Content fixture on disk, scanned through a resolved config. */
  async function scanFixture(
    files: Record<string, string>,
    locales?: Record<string, { lang: string; label: string }>,
  ): Promise<PageSource[]> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ap-pages-'));
    tmpDirs.push(root);
    await Promise.all(
      Object.entries(files).map(async ([rel, body]) => {
        await mkdir(path.dirname(path.join(root, 'content', rel)), {
          recursive: true,
        });
        await writeFile(path.join(root, 'content', rel), body);
      }),
    );
    const resolved = resolveConfig(
      {
        contentDir: 'content',
        title: 'Site',
        description: 'desc',
        hostname: 'https://test.example.com',
        locales,
      },
      root,
    );
    return scanPages(resolved);
  }

  it('discovers markdown recursively in sorted order, ignoring other extensions', async () => {
    const pages = await scanFixture({
      'index.md': '# Home\n',
      'guide/b.md': '# B\n',
      'guide/sub/a.md': '# A\n',
      'notes.txt': 'ignored\n',
    });
    expect(pages.map(p => p.relPath)).toEqual([
      'guide/b.md',
      'guide/sub/a.md',
      'index.md',
    ]);
    expect(pages.map(p => p.route)).toEqual(['/guide/b', '/guide/sub/a', '/']);
  });

  it('fails fast when the default locale content dir is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ap-pages-'));
    tmpDirs.push(root);
    const resolved = resolveConfig(
      {
        contentDir: 'missing',
        title: 'Site',
        description: 'desc',
        hostname: 'https://test.example.com',
      },
      root,
    );
    // Silent empty output here would hide a typo'd contentDir behind a
    // seemingly successful zero-page build.
    await expect(scanPages(resolved)).rejects.toThrowError(
      /contentDir does not exist: .*missing/,
    );
  });

  it('stays silent when only an extra locale dir is missing', async () => {
    const pages = await scanFixture(
      { 'index.md': '# Home\n' },
      { en: { lang: 'en', label: 'English' } },
    );
    // No `content/en/` on disk: an unwritten locale is a legal empty state.
    expect(pages.map(p => p.route)).toEqual(['/']);
  });

  it('keeps extra locale dirs out of the default locale without eating prefixes', async () => {
    const pages = await scanFixture(
      {
        'en.md': '# en\n',
        'english.md': '# english\n',
        'en/guide.md': '# guide\n',
        'about.md': '# about\n',
      },
      { en: { lang: 'en', label: 'English' } },
    );
    const defaultRel = pages
      .filter(p => p.locale.prefix === '')
      .map(p => p.relPath);
    // `en.md` and the whole `en/` tree belong to the extra locale, but the
    // sibling `english.md` must not be swallowed by the prefix filter.
    expect(defaultRel).toEqual(['about.md', 'english.md']);
    const en = pages.filter(p => p.locale.prefix === '/en');
    expect(en.map(p => p.route)).toEqual(['/en/guide']);
  });

  it('rejects index/README duplicates surfacing through the scan', async () => {
    await expect(
      scanFixture({ 'guide/index.md': '# G\n', 'guide/README.md': '# G\n' }),
    ).rejects.toThrowError(/duplicate route \/guide\//);
  });
});
