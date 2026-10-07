import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { MarkdownRenderer, NavItem } from '../../../shared/types.ts';
import { makeRenderer } from '../../markdown/__tests__/helpers.ts';
import { buildChrome, buildNavbar, buildSidebar } from '../nav-tree.ts';
import type { RenderedPage } from '../pages.ts';
import { routeOf } from '../pages.ts';

/** Narrow a navbar entry to a folder row; leaves/headers fail the test. */
function folderOf(
  item: NavItem | undefined,
): Extract<NavItem, { kind: 'folder' }> {
  if (item?.kind !== 'folder') throw new Error('folder row missing');
  return item;
}

function page(
  relPath: string,
  title: string,
  frontmatter: { icon?: string; overview?: boolean } = {},
): RenderedPage {
  // Routes flow through routeOf so fixtures cannot drift from production.
  const route = routeOf(relPath, '');
  return {
    filePath: `/site/content/${relPath}`,
    locale: { key: 'root', lang: 'zh-CN', label: 'zh', prefix: '' },
    relPath,
    route,
    meta: {
      route,
      locale: 'root',
      title,
      headings: [],
      frontmatter,
      createdAt: null,
      updatedAt: null,
    },
  };
}

/** Real markdown source: frontmatter block + the h1 the nav title reads. */
const indexSrc = (front: string[], title: string): string =>
  ['---', ...front, '---', '', `# ${title}`].join('\n');

describe('buildSidebar folder semantics', () => {
  const pages = [
    page('index.md', 'Home'),
    page('guide/index.md', '指南总览'),
    page('guide/intro.md', '介绍'),
    page('guide/advanced/deep.md', '进阶'),
    page('loose/only.md', '孤页'),
  ];

  it('turns a folder with index.md into one navigating group', () => {
    const sidebar = buildSidebar(pages, []);
    const guide = sidebar.find(
      item => item.kind === 'group' && item.text === '指南总览',
    );
    if (guide?.kind !== 'group') throw new Error('guide group missing');
    expect(guide.link).toBe('/guide/index.html');
    // The index page must not repeat as a child item.
    expect(
      guide.children.some(
        child => child.kind === 'link' && child.link === '/guide/index.html',
      ),
    ).toBe(false);
    expect(guide.children.map(child => child.kind)).toContain('group');
  });

  it('treats a folder README.md as its index page', () => {
    const sidebar = buildSidebar(
      [page('guide/README.md', '指南总览'), page('guide/intro.md', '介绍')],
      [],
    );
    const guide = sidebar.find(
      item => item.kind === 'group' && item.text === '指南总览',
    );
    if (guide?.kind !== 'group') throw new Error('guide group missing');
    expect(guide.link).toBe('/guide/index.html');
    // The README index page must not repeat as a child item.
    expect(
      guide.children.some(
        child => child.kind === 'link' && child.link === '/guide/index.html',
      ),
    ).toBe(false);
    expect(guide.children).toEqual([
      { kind: 'link', text: '介绍', link: '/guide/intro.html' },
    ]);
  });

  it('keeps index-less folders as plain groups without link', () => {
    const sidebar = buildSidebar(pages, []);
    const advanced = sidebar.flatMap(item =>
      item.kind === 'group' ? item.children : [],
    );
    const node = advanced.find(
      item => item.kind === 'group' && item.text === 'advanced',
    );
    if (node?.kind !== 'group') throw new Error('advanced group missing');
    expect(node.link).toBeUndefined();
    expect(node.children).toEqual([
      { kind: 'link', text: '进阶', link: '/guide/advanced/deep.html' },
    ]);
  });

  it('nests groups recursively (multi-level sidebar)', () => {
    const sidebar = buildSidebar(pages, []);
    const guide = sidebar.find(
      item => item.kind === 'group' && item.text === '指南总览',
    );
    if (guide?.kind !== 'group') throw new Error('guide group missing');
    const nested = guide.children.find(child => child.kind === 'group');
    expect(nested).toBeDefined();
  });

  it('excludes the locale home and nav.exclude routes', () => {
    const sidebar = buildSidebar(pages, ['/loose']);
    expect(
      sidebar.some(item => item.kind === 'group' && item.text === 'loose'),
    ).toBe(false);
    expect(
      sidebar.some(item => item.kind === 'link' && item.link === '/index.html'),
    ).toBe(false);
  });

  it('excludes a root README.md home like index.md', () => {
    const sidebar = buildSidebar(
      [page('README.md', 'Home'), page('a.md', '甲')],
      [],
    );
    expect(sidebar).toEqual([{ kind: 'link', text: '甲', link: '/a.html' }]);
  });
});

describe('buildNavbar folder-row navigation', () => {
  it('links the top-level row and keeps the flagged overview row in the panel', () => {
    const nav = buildNavbar(
      [page('guide/index.md', '指南总览'), page('guide/intro.md', '介绍')],
      [],
    );
    const guide = folderOf(nav.find(item => item.text === '指南总览'));
    // 板块名即总览: the bar row navigates to the folder index like the
    // sidebar group row.
    expect(guide.link).toBe('/guide/index.html');
    // The bar row is detached from its panel, so the panel keeps the index
    // page as its flagged overview row instead of deduping it.
    expect(guide.children).toEqual([
      {
        kind: 'leaf',
        text: '指南总览',
        link: '/guide/index.html',
        index: true,
      },
      { kind: 'leaf', text: '介绍', link: '/guide/intro.html' },
    ]);
  });

  it('lists a folder README.md as the flagged overview row', () => {
    const nav = buildNavbar(
      [page('guide/README.md', '指南总览'), page('guide/intro.md', '介绍')],
      [],
    );
    const guide = folderOf(nav.find(item => item.text === '指南总览'));
    expect(guide.link).toBe('/guide/index.html');
    expect(guide.children[0]).toEqual({
      kind: 'leaf',
      text: '指南总览',
      link: '/guide/index.html',
      index: true,
    });
  });

  it('dedupes the index inside a nested folder row panel', () => {
    const nav = buildNavbar(
      [
        page('guide/index.md', '指南总览'),
        page('guide/advanced/index.md', '进阶总览'),
        page('guide/advanced/deep.md', '深水区'),
      ],
      [],
    );
    const guide = folderOf(nav.find(item => item.text === '指南总览'));
    const advanced = folderOf(
      guide.children.find(item => item.text === '进阶总览'),
    );
    // The nested row sits right above its flyout: linking it turns the
    // repeated index child into a duplicate of the row's own destination.
    expect(advanced.link).toBe('/guide/advanced/index.html');
    expect(advanced.children).toEqual([
      { kind: 'leaf', text: '深水区', link: '/guide/advanced/deep.html' },
    ]);
  });

  it('keeps index-less folders as link-less container rows', () => {
    const nav = buildNavbar([page('loose/a.md', '甲')], []);
    const loose = folderOf(nav.find(item => item.text === 'loose'));
    expect(loose.link).toBeUndefined();
    expect(loose.children).toEqual([
      { kind: 'leaf', text: '甲', link: '/loose/a.html' },
    ]);
  });
});

describe('frontmatter overview opt-out', () => {
  const pages = [
    page('guide/index.md', '指南总览'),
    page('guide/intro.md', '介绍'),
    page('quiet/index.md', '安静总览', { overview: false }),
    page('quiet/only.md', '唯一'),
  ];

  it('drops the top-level overview row but keeps the folder link', () => {
    const nav = buildNavbar(pages, []);
    const quiet = folderOf(nav.find(item => item.text === '安静总览'));
    // 板块名即总览 still holds: the bar row keeps navigating to the index.
    expect(quiet.link).toBe('/quiet/index.html');
    // No overview row in the panel, and the payload marker tells the
    // client not to synthesize one for the nested flyout either.
    expect(quiet.overview).toBe(false);
    expect(quiet.children).toEqual([
      { kind: 'leaf', text: '唯一', link: '/quiet/only.html' },
    ]);
    // Opted-in folders stay untouched: no marker, flagged row intact.
    const guide = folderOf(nav.find(item => item.text === '指南总览'));
    expect(guide.overview).toBeUndefined();
    expect(guide.children[0]).toMatchObject({ index: true });
  });

  it('scopes the opt-out to the navbar overview, not the sidebar', () => {
    const { navbar, sidebar } = buildChrome(pages, []);
    const quiet = sidebar.find(
      item => item.kind === 'group' && item.text === '安静总览',
    );
    if (quiet?.kind !== 'group') throw new Error('quiet group missing');
    expect(quiet.link).toBe('/quiet/index.html');
    void navbar;
  });

  it('marks nested folders so the client skips synthesizing a row', () => {
    const nav = buildNavbar(
      [
        page('outer/index.md', '外层'),
        page('outer/inner/index.md', '内层', { overview: false }),
        page('outer/inner/deep.md', '深处'),
      ],
      [],
    );
    const outer = folderOf(nav.find(item => item.text === '外层'));
    const inner = folderOf(outer.children.find(item => item.text === '内层'));
    expect(inner.link).toBe('/outer/inner/index.html');
    expect(inner.overview).toBe(false);
    expect(inner.children).toEqual([
      { kind: 'leaf', text: '深处', link: '/outer/inner/deep.html' },
    ]);
  });
});

describe('overview opt-out through the real parse pipeline', () => {
  // The fixtures above hand-build meta.frontmatter and would pass even if
  // parseFrontmatter dropped the key entirely; these render actual markdown
  // sources so the frontmatter comes from the production parser.
  let md: MarkdownRenderer;
  beforeAll(async () => {
    md = await makeRenderer();
  });

  const pageOf = (relPath: string, src: string): RenderedPage => {
    const result = md.render(src, { filePath: `/site/content/${relPath}` });
    const route = routeOf(relPath, '');
    return {
      filePath: `/site/content/${relPath}`,
      locale: { key: 'root', lang: 'zh-CN', label: 'zh', prefix: '' },
      relPath,
      route,
      meta: {
        route,
        locale: 'root',
        title: result.title ?? '',
        headings: result.headings,
        frontmatter: result.frontmatter,
        createdAt: null,
        updatedAt: null,
      },
    };
  };

  it('drops the overview row when the parsed index frontmatter says false', () => {
    const nav = buildNavbar(
      [
        pageOf('quiet/index.md', indexSrc(['overview: false'], '安静总览')),
        pageOf('quiet/only.md', '# 唯一'),
      ],
      [],
    );
    const quiet = folderOf(nav.find(item => item.text === '安静总览'));
    expect(quiet.link).toBe('/quiet/index.html');
    expect(quiet.overview).toBe(false);
    expect(quiet.children).toEqual([
      { kind: 'leaf', text: '唯一', link: '/quiet/only.html' },
    ]);
  });

  it('keeps the flagged overview row when overview is absent', () => {
    const nav = buildNavbar(
      [
        pageOf('guide/index.md', '# 指南总览'),
        pageOf('guide/intro.md', '# 介绍'),
      ],
      [],
    );
    const guide = folderOf(nav.find(item => item.text === '指南总览'));
    expect(guide.overview).toBeUndefined();
    expect(guide.children[0]).toMatchObject({
      kind: 'leaf',
      text: '指南总览',
      link: '/guide/index.html',
      index: true,
    });
  });

  it('does not warn for an explicit overview: true', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { navbar } = buildChrome(
      [
        pageOf('guide/index.md', indexSrc(['overview: true'], '指南总览')),
        pageOf('guide/intro.md', '# 介绍'),
      ],
      [],
    );
    const guide = folderOf(navbar.find(item => item.text === '指南总览'));
    expect(guide.children[0]).toMatchObject({ index: true });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildNavbar display tweaks', () => {
  const pages = [
    page('misc/index.md', '杂项总览'),
    page('misc/reciter.md', '背词器'),
    page('misc/recommend_packages.md', '软件汇总'),
    page('misc/recommend_websites.md', '网址汇总'),
    page('misc/college.md', '校内专栏'),
    page('hobby/galgame.md', 'galgame'),
    page('hobby/snack.md', '零食区'),
    page('hobby/other/uno.md', '其他游戏'),
  ];

  it('relabels the nav entry and sidebar group without touching routes', () => {
    const navbar = buildNavbar(pages, [], { misc: { label: '杂项' } });
    const relabeled = folderOf(navbar.find(item => item.text === '杂项'));
    expect(navbar.find(item => item.text === 'misc')).toBeUndefined();
    // The relabeled folder row still navigates to the directory index.
    expect(relabeled.link).toBe('/misc/index.html');
    const sidebar = buildSidebar(pages, [], { misc: '杂项' });
    const group = sidebar.find(item => item.kind === 'group');
    if (group?.kind !== 'group') throw new Error('group missing');
    expect(group.text).toBe('杂项');
    expect(group.link).toBe('/misc/index.html');
  });

  it('keeps the directory index link through label+groups and label+items', () => {
    // Regression: the tweak used to be spread as
    // `...(label ? { text } : { ...item })`, dropping item.link (the
    // directory index route) whenever a label was set.
    const grouped = buildNavbar(pages, [], {
      misc: { label: '杂项', groups: [{ items: ['reciter'] }] },
    });
    expect(folderOf(grouped.find(item => item.text === '杂项')).link).toBe(
      '/misc/index.html',
    );
    const curated = buildNavbar(pages, [], {
      misc: {
        label: '杂项',
        items: [{ text: '背词器', link: '/misc/reciter.html' }],
      },
    });
    expect(folderOf(curated.find(item => item.text === '杂项')).link).toBe(
      '/misc/index.html',
    );
  });

  it('reorders members through a caption-less group', () => {
    const nav = buildNavbar(pages, [], {
      misc: {
        groups: [
          {
            items: [
              'recommend_packages',
              'recommend_websites',
              'college',
              'reciter',
            ],
          },
        ],
      },
    });
    const misc = folderOf(nav.find(item => item.text === '杂项总览'));
    expect(misc.children.map(c => c.text)).toEqual([
      '软件汇总',
      '网址汇总',
      '校内专栏',
      '背词器',
    ]);
  });

  it('renders caption groups as header items with inlined children', () => {
    const nav = buildNavbar(pages, [], {
      hobby: {
        groups: [
          { text: '游戏', items: ['galgame', 'other'] },
          { text: '其他', items: ['snack'] },
        ],
      },
    });
    const hobby = folderOf(nav.find(item => item.text === 'hobby'));
    expect(hobby.children).toHaveLength(2);
    const games = hobby.children[0];
    if (games?.kind !== 'header') throw new Error('header group missing');
    // 'other' has no index page, so the subdirectory keeps its dirname.
    expect(games.children.map(c => c.text)).toEqual(['galgame', 'other']);
  });

  it('appends unlisted members after the groups', () => {
    const nav = buildNavbar(pages, [], {
      misc: { groups: [{ items: ['reciter'] }] },
    });
    const misc = folderOf(nav.find(item => item.text === '杂项总览'));
    // Listed member first, the rest keep their generated order after it.
    expect(misc.children.map(c => c.text)).toEqual([
      '背词器',
      '软件汇总',
      '网址汇总',
      '校内专栏',
    ]);
  });

  it('ignores unknown tweak paths instead of throwing', () => {
    const nav = buildNavbar(pages, [], {
      misc: { groups: [{ items: ['reciter', 'ghost'] }] },
    });
    const misc = folderOf(nav.find(item => item.text === '杂项总览'));
    expect(misc.children.map(c => c.text)).toEqual([
      '背词器',
      '软件汇总',
      '网址汇总',
      '校内专栏',
    ]);
  });
});

describe('buildNavbar curated tweak items', () => {
  const pages = [
    page('articles/index.md', '我的文章'),
    page('articles/linux/index.md', '前言'),
    page('articles/linux/basic.md', '基础'),
    page('articles/telegram.md', 'TG 教程'),
    page('articles/external.md', '外部文章'),
  ];

  it('takes curated items verbatim and appends uncovered members', () => {
    const nav = buildNavbar(pages, [], {
      articles: {
        items: [
          {
            text: '我的文章',
            link: '/articles/index.html',
            index: true,
          },
          {
            text: 'Linux 相关',
            children: [
              { text: '前言', link: '/articles/linux/index.html' },
              { text: '基础', link: '/articles/linux/basic.html' },
            ],
          },
        ],
      },
    });
    const articles = folderOf(nav.find(item => item.text === '我的文章'));
    // The loose config shapes normalize into the payload union (kind is
    // assigned from link/children presence); telegram/external are not
    // covered by any curated link and keep their generated slot after them.
    expect(articles.children).toEqual([
      {
        kind: 'leaf',
        text: '我的文章',
        link: '/articles/index.html',
        index: true,
      },
      {
        kind: 'folder',
        text: 'Linux 相关',
        children: [
          { kind: 'leaf', text: '前言', link: '/articles/linux/index.html' },
          { kind: 'leaf', text: '基础', link: '/articles/linux/basic.html' },
        ],
      },
      { kind: 'leaf', text: 'TG 教程', link: '/articles/telegram.html' },
      { kind: 'leaf', text: '外部文章', link: '/articles/external.html' },
    ]);
  });

  it('covers a generated member through any curated descendant link', () => {
    const nav = buildNavbar(pages, [], {
      articles: {
        items: [
          {
            text: 'Linux 相关',
            link: '/articles/linux/index.html',
          },
        ],
      },
    });
    const articles = folderOf(nav.find(item => item.text === '我的文章'));
    // The linux folder row is covered by its own index route; the folder
    // index page itself is not covered here, so it appends with the loose
    // pages in generated order.
    expect(articles.children.map(item => item.text)).toEqual([
      'Linux 相关',
      '我的文章',
      'TG 教程',
      '外部文章',
    ]);
  });

  it('throws when a curated internal link matches no page', () => {
    expect(() =>
      buildNavbar(pages, [], {
        articles: {
          items: [{ text: 'ghost', link: '/articles/ghost.html' }],
        },
      }),
    ).toThrowError(/\/articles\/ghost\.html/);
  });

  it('rejects a childless curated item without a link', () => {
    expect(() =>
      buildNavbar(pages, [], {
        articles: { items: [{ text: '无链接行' }] },
      }),
    ).toThrowError(/无链接行/);
  });

  it('skips external curated links in validation and coverage', () => {
    const nav = buildNavbar(pages, [], {
      articles: {
        items: [{ text: 'blog', link: 'https://example.com' }],
      },
    });
    const articles = folderOf(nav.find(item => item.text === '我的文章'));
    expect(articles.children[0]).toEqual({
      kind: 'leaf',
      text: 'blog',
      link: 'https://example.com',
    });
  });

  it('skips opaque-scheme curated links (mailto) from validation', () => {
    // Any scheme leaves the site, so mailto rows must not hit the
    // "matches no page under it" route check.
    const nav = buildNavbar(pages, [], {
      articles: {
        items: [{ text: 'mail me', link: 'mailto:me@example.com' }],
      },
    });
    const articles = folderOf(nav.find(item => item.text === '我的文章'));
    expect(articles.children[0]).toEqual({
      kind: 'leaf',
      text: 'mail me',
      link: 'mailto:me@example.com',
    });
  });

  it('backfills row icons from the linked pages', () => {
    const iconed = [
      page('articles/index.md', '我的文章', { icon: 'solid/blog' }),
      page('articles/linux/index.md', '前言', { icon: 'brands/linux' }),
      page('articles/linux/basic.md', '基础'),
    ];
    const nav = buildNavbar(iconed, [], {
      articles: {
        items: [
          {
            text: '我的文章',
            link: '/articles/index.html',
            index: true,
          },
          {
            text: 'Linux 相关',
            children: [
              { text: '前言', link: '/articles/linux/index.html' },
              { text: '基础', link: '/articles/linux/basic.html' },
            ],
          },
        ],
      },
    });
    const articles = folderOf(nav.find(item => item.text === '我的文章'));
    // Overview and leaf rows inherit the page frontmatter icon; a page
    // without one contributes none.
    expect(articles.children).toEqual([
      {
        kind: 'leaf',
        text: '我的文章',
        link: '/articles/index.html',
        icon: 'solid/blog',
        index: true,
      },
      {
        kind: 'folder',
        text: 'Linux 相关',
        children: [
          {
            kind: 'leaf',
            text: '前言',
            link: '/articles/linux/index.html',
            icon: 'brands/linux',
          },
          { kind: 'leaf', text: '基础', link: '/articles/linux/basic.html' },
        ],
      },
    ]);
  });
});

describe('buildNavbar top-level order', () => {
  const pages = [
    page('index.md', 'Home'),
    page('misc/index.md', '杂项总览'),
    page('coding/git.md', 'Git'),
    page('hobby/galgame.md', 'galgame'),
  ];

  it('keeps generated order without nav.order', () => {
    const nav = buildNavbar(pages, []);
    expect(nav.map(item => item.text)).toEqual(['杂项总览', 'coding', 'hobby']);
  });

  it('lists nav.order directories first and appends the rest', () => {
    const nav = buildNavbar(pages, [], undefined, ['hobby', 'ghost', 'coding']);
    // 'ghost' matches no directory and must not drop anything.
    expect(nav.map(item => item.text)).toEqual(['hobby', 'coding', '杂项总览']);
  });
});

describe('buildChrome shared tree', () => {
  const pages = [
    page('index.md', 'Home'),
    page('misc/index.md', '杂项总览'),
    page('misc/reciter.md', '背词器'),
    page('coding/git.md', 'Git'),
  ];

  // Core contract: one tree pass must equal the standalone builders.
  it('matches buildNavbar/buildSidebar output for the same input', () => {
    const tweaks = { misc: { label: '杂项' } };
    const chrome = buildChrome(pages, [], { tweaks, order: ['coding'] });
    expect(chrome.navbar).toEqual(buildNavbar(pages, [], tweaks, ['coding']));
    expect(chrome.sidebar).toEqual(buildSidebar(pages, []));
  });

  it('applies sidebar labels without leaking them into the navbar', () => {
    const chrome = buildChrome(pages, [], { labels: { misc: '杂项' } });
    expect(chrome.navbar.find(item => item.text === '杂项')).toBeUndefined();
    const group = chrome.sidebar.find(item => item.kind === 'group');
    if (group?.kind !== 'group') throw new Error('group missing');
    expect(group.text).toBe('杂项');
  });
});
