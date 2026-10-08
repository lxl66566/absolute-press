import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import type { CollectedLink, LocaleInfo } from '../../../shared/types.ts';
import {
  applyAssetBase,
  ASSET_TOKEN,
  bareLinkReport,
  deadLinkReport,
  LinkResolver,
} from '../assets.ts';
import type { DeadLink } from '../assets.ts';
import { routeOf } from '../pages.ts';
import type { PageSource } from '../pages.ts';

const LOCALE: LocaleInfo = { key: '', lang: 'zh-CN', label: 'zh', prefix: '' };

/** Platform-safe absolute content path (LinkResolver uses path.resolve). */
function file(rel: string): string {
  return path.resolve('/content', rel);
}

// Routes flow through routeOf so fixtures cannot drift from production.
function page(rel: string): PageSource {
  return {
    filePath: file(rel),
    locale: LOCALE,
    relPath: rel,
    route: routeOf(rel, LOCALE.prefix, 'slash'),
  };
}

const PAGES: PageSource[] = [
  page('a.md'),
  page('b.md'),
  page('essay/2022.md'),
  page('essay/2023.md'),
  page('articles/linux/index.md'),
  page('articles/linux/basic.md'),
  page('hobbies/other_games/README.md'),
  page('hobbies/galgame.md'),
  page('blog/log.md'),
];

const ENV_A = { filePath: file('a.md') };
const ENV_GALGAME = { filePath: file('hobbies/galgame.md') };
const ENV_LOG = { filePath: file('blog/log.md') };
const ENV_BASIC = { filePath: file('articles/linux/basic.md') };

// Any readable file works as an image source; use this test file via a
// page-relative src — a posix-absolute src would read as root-relative and
// pass through resolveImage untouched.
const TEST_FILE_SRC = path.relative(
  path.dirname(ENV_A.filePath),
  fileURLToPath(import.meta.url),
);

let resolver: LinkResolver;
beforeEach(() => {
  resolver = new LinkResolver('build');
  resolver.setPages(PAGES);
});

describe('LinkResolver.resolveLink', () => {
  it('resolves plain .md links as before', () => {
    expect(resolver.resolveLink('./b.md', ENV_A)).toBe('b');
  });

  it('resolves extensionless links via the .md candidate', () => {
    expect(resolver.resolveLink('./b', ENV_A)).toBe('b');
  });

  it('normalizes a trailing slash before resolving', () => {
    expect(resolver.resolveLink('./essay/2022/', ENV_A)).toBe('essay/2022');
  });

  it('resolves .md links carrying a trailing slash', () => {
    expect(resolver.resolveLink('../essay/2023.md/', ENV_GALGAME)).toBe(
      '../essay/2023',
    );
  });

  it('resolves directory links to the trailing-slash index route', () => {
    expect(resolver.resolveLink('../articles/linux', ENV_GALGAME)).toBe(
      '../articles/linux/',
    );
  });

  it('resolves directory links via README.md (VuePress dir index)', () => {
    expect(resolver.resolveLink('../hobbies/other_games/', ENV_LOG)).toBe(
      '../hobbies/other_games/',
    );
  });

  it('rewrites explicit README.md links to the canonical index route', () => {
    expect(
      resolver.resolveLink('../hobbies/other_games/README.md', ENV_LOG),
    ).toBe('../hobbies/other_games/');
  });

  it('resolves a link to the containing directory index as ./', () => {
    expect(resolver.resolveLink('./index.md', ENV_BASIC)).toBe('./');
  });

  it('re-appends anchors to the resolved route', () => {
    expect(resolver.resolveLink('./b#sec', ENV_A)).toBe('b#sec');
  });

  it('returns null and records dead links when no candidate hits', () => {
    expect(resolver.resolveLink('./missing', ENV_A)).toBeNull();
    expect(resolver.resolveLink('./missing.md', ENV_A)).toBeNull();
    expect(resolver.deadLinks).toEqual([
      { file: ENV_A.filePath, raw: './missing' },
      { file: ENV_A.filePath, raw: './missing.md' },
    ]);
  });
});

describe('deadLinkReport', () => {
  const A = file('a.md');

  it('joins source lines by file+raw and keeps line-less entries', () => {
    const dead: DeadLink[] = [
      { file: A, raw: './x.md' },
      // Image dead link: recorded by resolveImage, never in rendered links.
      { file: A, raw: './pic.png' },
    ];
    const links: CollectedLink[] = [
      {
        raw: './x.md',
        resolved: './x.md',
        kind: 'internal',
        dead: true,
        line: 3,
      },
      {
        raw: './ok.md',
        resolved: 'ok',
        kind: 'internal',
        dead: false,
        line: 5,
      },
    ];
    expect(deadLinkReport(dead, [{ file: A, links }])).toEqual([
      { file: A, raw: './x.md', line: 3 },
      { file: A, raw: './pic.png' },
    ]);
  });

  it('dedupes repeated records and renders without a line', () => {
    const dead: DeadLink[] = [
      { file: A, raw: './x.md' },
      { file: A, raw: './x.md' },
    ];
    // Dead island-inner link: collected without a line.
    const links: CollectedLink[] = [
      { raw: './x.md', resolved: './x.md', kind: 'internal', dead: true },
    ];
    expect(deadLinkReport(dead, [{ file: A, links }])).toEqual([
      { file: A, raw: './x.md' },
    ]);
  });
});

describe('bareLinkReport', () => {
  const A = file('a.md');

  it('collects bare links with their source lines, deduped', () => {
    const links: CollectedLink[] = [
      {
        raw: 'guide/x.md',
        resolved: 'guide/x.md',
        kind: 'external',
        dead: false,
        bare: true,
        line: 7,
      },
      {
        raw: 'guide/x.md',
        resolved: 'guide/x.md',
        kind: 'external',
        dead: false,
        bare: true,
        line: 9,
      },
      { raw: './ok.md', resolved: 'ok', kind: 'internal', dead: false },
      {
        raw: 'img.png',
        resolved: 'img.png',
        kind: 'external',
        dead: false,
      },
    ];
    expect(bareLinkReport([{ file: A, links }])).toEqual([
      { file: A, raw: 'guide/x.md', line: 7 },
    ]);
  });

  it('returns entries without a line when none was stamped', () => {
    const links: CollectedLink[] = [
      {
        raw: 'guide/x.md',
        resolved: 'guide/x.md',
        kind: 'external',
        dead: false,
        bare: true,
      },
    ];
    expect(bareLinkReport([{ file: A, links }])).toEqual([
      { file: A, raw: 'guide/x.md' },
    ]);
  });

  it('is empty when every link is prefixed or non-markdown', () => {
    const links: CollectedLink[] = [
      { raw: './b.md', resolved: 'b', kind: 'internal', dead: false },
      {
        raw: 'img.png',
        resolved: 'img.png',
        kind: 'external',
        dead: false,
      },
    ];
    expect(bareLinkReport([{ file: A, links }])).toEqual([]);
  });
});

describe('LinkResolver.resolveImage', () => {
  it('passes remote, data and root-relative sources through untouched', () => {
    const passthrough = [
      'https://cdn.example.com/x.png',
      'http://cdn.example.com/x.png',
      '//cdn.example.com/x.png',
      'data:image/png;base64,AAAA',
      '/static/logo.svg',
    ];
    for (const src of passthrough) {
      expect(resolver.resolveImage(src, ENV_A)).toBe(src);
    }
    expect(resolver.deadLinks).toEqual([]);
    expect(resolver.images.size).toBe(0);
  });

  it('records a dead link and returns the raw src when the file is missing', () => {
    expect(resolver.resolveImage('./missing.png', ENV_A)).toBe('./missing.png');
    expect(resolver.deadLinks).toEqual([
      { file: ENV_A.filePath, raw: './missing.png' },
    ]);
  });

  it('emits a hashed asset token and registers the file content', () => {
    const token = resolver.resolveImage(TEST_FILE_SRC, ENV_A);
    expect(token.startsWith(ASSET_TOKEN)).toBe(true);
    const fileName = token.slice(ASSET_TOKEN.length);
    // Base name dots collapse to dashes; only hash + extension keep theirs.
    expect(fileName).toMatch(/^assets\/img\/assets-test\.[0-9a-f]{8}\.ts$/);
    const buf = resolver.images.get(fileName);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf?.length).toBeGreaterThan(0);
  });
});

describe('applyAssetBase', () => {
  it('rewrites src and href attributes in double quotes', () => {
    const html =
      '<p><img src="absasset:assets/img/a.png" alt="a"></p>' +
      '<a href="absasset:assets/img/b.png">b</a>';
    expect(applyAssetBase(html, '../')).toBe(
      '<p><img src="../assets/img/a.png" alt="a"></p>' +
        '<a href="../assets/img/b.png">b</a>',
    );
  });

  it('rewrites single-quoted attributes too', () => {
    expect(applyAssetBase("<img src='absasset:assets/img/a.png'>", '../')).toBe(
      "<img src='../assets/img/a.png'>",
    );
    expect(
      applyAssetBase("<a href='absasset:assets/img/b.png'>x</a>", ''),
    ).toBe("<a href='assets/img/b.png'>x</a>");
  });

  it('keeps a root base as an empty prefix', () => {
    expect(applyAssetBase('<img src="absasset:assets/img/a.png">', '')).toBe(
      '<img src="assets/img/a.png">',
    );
  });

  it('leaves literal tokens in prose and code blocks untouched', () => {
    const html = [
      '<p>The absasset:assets/img/a.png token is internal.</p>',
      '<pre><code>const TOKEN = "absasset:assets/img/a.png";</code></pre>',
      '<p><code>absasset:x</code> in inline code</p>',
    ].join('\n');
    expect(applyAssetBase(html, '../')).toBe(html);
  });

  it('rewrites several attributes in one document', () => {
    const html =
      '<img src="absasset:assets/img/a.png"><img src="absasset:assets/img/b.png">';
    expect(applyAssetBase(html, '../')).toBe(
      '<img src="../assets/img/a.png"><img src="../assets/img/b.png">',
    );
  });
});

describe('LinkResolver.resolveLink with registered refs', () => {
  const REF = file('reference/term.md');

  beforeEach(() => {
    resolver.setRefs([{ filePath: REF, root: path.resolve('/content') }]);
  });

  it('emits the absasset token rooted at the locale content root', () => {
    // Ref html embeds at any page depth, so hrefs cannot be page-relative:
    // the token gets the host page's base prefix via applyAssetBase.
    expect(resolver.resolveLink('./blog/log.md', { filePath: REF })).toBe(
      `${ASSET_TOKEN}blog/log`,
    );
    expect(
      resolver.resolveLink('./articles/linux#anchor', { filePath: REF }),
    ).toBe(`${ASSET_TOKEN}articles/linux/#anchor`);
  });

  it('resolves from a nested ref against the content root, not its own dir', () => {
    const nested = file('reference/nested/deep.md');
    resolver.setRefs([{ filePath: nested, root: path.resolve('/content') }]);
    expect(resolver.resolveLink('./blog/log.md', { filePath: nested })).toBe(
      `${ASSET_TOKEN}blog/log`,
    );
  });

  it('still records dead links against the ref file', () => {
    expect(
      resolver.resolveLink('./dead-target.md', { filePath: REF }),
    ).toBeNull();
    expect(resolver.deadLinks).toEqual([
      { file: REF, raw: './dead-target.md' },
    ]);
  });
});

describe('LinkResolver state across sync rounds', () => {
  it('drops dead links recorded in a previous round', () => {
    resolver.resolveLink('./missing', ENV_A);
    expect(resolver.deadLinks).toHaveLength(1);
    resolver.setPages(PAGES);
    expect(resolver.deadLinks).toEqual([]);
  });

  it('drops images recorded in a previous round', () => {
    const token = resolver.resolveImage(TEST_FILE_SRC, ENV_A);
    expect(token).toMatch(/^absasset:/);
    expect(resolver.images.size).toBe(1);
    resolver.setPages(PAGES);
    expect(resolver.images.size).toBe(0);
  });
});
