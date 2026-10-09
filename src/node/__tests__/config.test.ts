import { describe, expect, it } from 'vitest';

import type { RelatedDepth } from '../../shared/types.ts';
import { ARCHIVE_PER_PAGE, HOME_FEED_PER_PAGE } from '../../shared/types.ts';
import { DEFAULT_RSS_LIMIT } from '../build/feeds.ts';
import { DEFAULT_TWO_HOP_NODE_LIMIT } from '../build/related.ts';
import { resolveConfig } from '../config.ts';
import { DEFAULT_COLLAPSED_LINES } from '../markdown/code-meta.ts';
import { DEFAULT_COPY_LABEL } from '../markdown/options.ts';

function baseConfig(): Parameters<typeof resolveConfig>[0] {
  return {
    contentDir: 'content',
    title: 't',
    description: 'd',
    hostname: 'https://x.dev',
  };
}

describe('resolveConfig code options', () => {
  it('applies the documented defaults', () => {
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 't',
        description: 'd',
        hostname: 'https://x.dev',
      },
      '/root',
    );
    expect(config.code).toEqual({
      lineNumbers: true,
      collapsedLines: DEFAULT_COLLAPSED_LINES,
      wrap: true,
      copyLabel: DEFAULT_COPY_LABEL,
    });
  });

  it('normalizes user overrides, keeping null to disable folding', () => {
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 't',
        description: 'd',
        hostname: 'https://x.dev',
        code: { lineNumbers: false, collapsedLines: null, wrap: false },
      },
      '/root',
    );
    expect(config.code).toEqual({
      lineNumbers: false,
      collapsedLines: null,
      wrap: false,
      copyLabel: DEFAULT_COPY_LABEL,
    });
  });

  it('passes code.copyLabel through to the resolved options', () => {
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 't',
        description: 'd',
        hostname: 'https://x.dev',
        code: { copyLabel: 'Copy' },
      },
      '/root',
    );
    expect(config.code.copyLabel).toBe('Copy');
  });
});

describe('resolveConfig hostname', () => {
  it('accepts a full http(s) origin', () => {
    expect(resolveConfig(baseConfig(), '/root').hostname).toBe('https://x.dev');
  });

  it('normalizes away trailing slashes', () => {
    const withSlash = { ...baseConfig(), hostname: 'https://x.dev/' };
    expect(resolveConfig(withSlash, '/root').hostname).toBe('https://x.dev');
  });

  it('keeps a base path for project-pages hosting', () => {
    const withPath = {
      ...baseConfig(),
      hostname: 'https://user.github.io/repo/',
    };
    expect(resolveConfig(withPath, '/root').hostname).toBe(
      'https://user.github.io/repo',
    );
  });

  it('rejects a scheme-less hostname', () => {
    const noScheme = { ...baseConfig(), hostname: 'example.com' };
    expect(() => resolveConfig(noScheme, '/root')).toThrowError(
      /hostname must be a full URL with an http\(s\) scheme.*got 'example\.com'/,
    );
  });

  it('rejects a non-http(s) scheme', () => {
    const ftp = { ...baseConfig(), hostname: 'ftp://example.com' };
    expect(() => resolveConfig(ftp, '/root')).toThrowError(
      /hostname must be a full URL with an http\(s\) scheme.*got 'ftp:\/\/example\.com'/,
    );
  });
});

describe('resolveConfig locales', () => {
  it('builds a default locale with no route prefix and sane defaults', () => {
    const { locales } = resolveConfig(baseConfig(), '/root');
    expect(locales).toEqual([
      { key: 'root', lang: 'zh-CN', label: '简体中文', prefix: '' },
    ]);
  });

  it('keeps user overrides for the default locale', () => {
    const { locales } = resolveConfig(
      { ...baseConfig(), lang: 'en-US', label: 'English' },
      '/root',
    );
    expect(locales[0]).toEqual({
      key: 'root',
      lang: 'en-US',
      label: 'English',
      prefix: '',
    });
  });

  it('prefixes extra locales with their config key', () => {
    const { locales } = resolveConfig(
      {
        ...baseConfig(),
        locales: { en: { lang: 'en-US', label: 'English' } },
      },
      '/root',
    );
    expect(locales).toHaveLength(2);
    expect(locales[1]).toEqual({
      key: 'en',
      lang: 'en-US',
      label: 'English',
      prefix: '/en',
    });
  });
});

describe('resolveConfig nav', () => {
  it('match-normalizes exclude prefixes: decode, collapse slashes, wrap in /', () => {
    const { nav } = resolveConfig(
      {
        ...baseConfig(),
        nav: {
          exclude: ['about', '/foo/', '//g//', '/标签', '/%E6%A0%87%E7%AD%BE2'],
        },
      },
      '/root',
    );
    expect(nav.exclude).toEqual(['/about', '/foo', '/g', '/标签', '/标签2']);
  });

  it('applies the documented defaults', () => {
    expect(resolveConfig(baseConfig(), '/root').nav).toEqual({
      exclude: [],
      order: [],
      align: 'left',
    });
  });
});

describe('resolveConfig sidebar', () => {
  it('keeps the configured order lists verbatim', () => {
    const { sidebar } = resolveConfig(
      {
        ...baseConfig(),
        sidebar: {
          order: ['blog'],
          tweaks: { guide: ['intro', 'advanced'], 'guide/advanced': ['deep'] },
        },
      },
      '/root',
    );
    expect(sidebar).toEqual({
      order: ['blog'],
      tweaks: { guide: ['intro', 'advanced'], 'guide/advanced': ['deep'] },
    });
  });

  it('applies the documented defaults', () => {
    expect(resolveConfig(baseConfig(), '/root').sidebar).toEqual({
      order: [],
      tweaks: {},
    });
  });
});

describe('resolveConfig pagination and feed sizes', () => {
  it('applies the documented defaults', () => {
    const config = resolveConfig(baseConfig(), '/root');
    expect(config.home).toEqual({
      feed: true,
      feedPerPage: HOME_FEED_PER_PAGE,
    });
    expect(config.archive).toEqual({ perPage: ARCHIVE_PER_PAGE });
    expect(config.feed).toEqual({ rssLimit: DEFAULT_RSS_LIMIT });
  });

  it('keeps user-provided page sizes and rss limit', () => {
    const config = resolveConfig(
      {
        ...baseConfig(),
        home: { feedPerPage: 5 },
        archive: { perPage: 30 },
        feed: { rssLimit: 50 },
      },
      '/root',
    );
    expect(config.home).toEqual({ feed: true, feedPerPage: 5 });
    expect(config.archive).toEqual({ perPage: 30 });
    expect(config.feed).toEqual({ rssLimit: 50 });
  });

  it('rejects non-integer or sub-1 sizes', () => {
    const badFeed = { ...baseConfig(), home: { feedPerPage: 0 } };
    expect(() => resolveConfig(badFeed, '/root')).toThrowError(
      /home\.feedPerPage must be an integer >= 1, got 0/,
    );
    const badArchive = {
      ...baseConfig(),
      archive: { perPage: 2.5 },
    };
    expect(() => resolveConfig(badArchive, '/root')).toThrowError(
      /archive\.perPage must be an integer/,
    );
    const badRss = { ...baseConfig(), feed: { rssLimit: -1 } };
    expect(() => resolveConfig(badRss, '/root')).toThrowError(
      /feed\.rssLimit must be an integer >= 1, got -1/,
    );
  });
});

describe('resolveConfig strictLinks', () => {
  it('defaults to warn', () => {
    expect(resolveConfig(baseConfig(), '/root').strictLinks).toBe('warn');
  });

  it('keeps a valid policy', () => {
    const error = resolveConfig(
      { ...baseConfig(), strictLinks: 'error' },
      '/root',
    );
    expect(error.strictLinks).toBe('error');
    const off = resolveConfig({ ...baseConfig(), strictLinks: 'off' }, '/root');
    expect(off.strictLinks).toBe('off');
  });

  it('rejects unknown policies', () => {
    // JS config files bypass the StrictLinks union; the resolver guards at
    // runtime. The cast only mirrors that unchecked input.
    const bad = { ...baseConfig(), strictLinks: 'strict' as 'error' };
    expect(() => resolveConfig(bad, '/root')).toThrowError(
      /strictLinks must be one of off, warn, error, got 'strict'/,
    );
  });
});

describe('resolveConfig favicon', () => {
  it('is absent by default', () => {
    expect(resolveConfig(baseConfig(), '/root').favicon).toBeUndefined();
  });

  it('keeps a configured favicon', () => {
    const config = resolveConfig(
      { ...baseConfig(), favicon: '/favicon.svg' },
      '/root',
    );
    expect(config.favicon).toBe('/favicon.svg');
  });

  it('treats a blank favicon as unconfigured', () => {
    const blank = resolveConfig({ ...baseConfig(), favicon: '  ' }, '/root');
    expect(blank.favicon).toBeUndefined();
  });
});

describe('resolveConfig seo', () => {
  it('is absent by default', () => {
    expect(resolveConfig(baseConfig(), '/root').seo).toBeUndefined();
  });

  it('keeps a configured share image and author', () => {
    const config = resolveConfig(
      {
        ...baseConfig(),
        seo: {
          image: '/og.png',
          author: { name: 'Alice', url: 'https://x.dev/about' },
        },
      },
      '/root',
    );
    expect(config.seo).toEqual({
      image: '/og.png',
      author: { name: 'Alice', url: 'https://x.dev/about' },
    });
  });

  it('keeps the section with an author alone', () => {
    const config = resolveConfig(
      { ...baseConfig(), seo: { author: { name: 'Alice' } } },
      '/root',
    );
    expect(config.seo).toEqual({ author: { name: 'Alice' } });
  });

  it('treats blank values as unconfigured', () => {
    const blank = resolveConfig(
      { ...baseConfig(), seo: { image: '  ', author: { name: ' ' } } },
      '/root',
    );
    expect(blank.seo).toBeUndefined();
    // A blank author drops out even when the image keeps the section alive.
    const imageOnly = resolveConfig(
      { ...baseConfig(), seo: { image: '/og.png', author: { name: ' ' } } },
      '/root',
    );
    expect(imageOnly.seo).toEqual({ image: '/og.png' });
  });
});

describe('resolveConfig head', () => {
  it('is empty by default', () => {
    expect(resolveConfig(baseConfig(), '/root').head).toEqual([]);
  });

  it('keeps configured tags in config order', () => {
    const config = resolveConfig(
      {
        ...baseConfig(),
        head: ['<meta name="a" content="1">', '<meta name="b" content="2">'],
      },
      '/root',
    );
    expect(config.head).toEqual([
      '<meta name="a" content="1">',
      '<meta name="b" content="2">',
    ]);
  });

  it('drops blank entries', () => {
    const config = resolveConfig(
      { ...baseConfig(), head: ['<meta name="a" content="1">', '   '] },
      '/root',
    );
    expect(config.head).toEqual(['<meta name="a" content="1">']);
  });
});

describe('resolveConfig footer credit', () => {
  it('is absent by default', () => {
    expect(resolveConfig(baseConfig(), '/root').footer).toBeUndefined();
  });

  it('keeps a custom credit', () => {
    const config = resolveConfig(
      { ...baseConfig(), footer: { credit: '© 2026 Someone' } },
      '/root',
    );
    expect(config.footer).toEqual({ credit: '© 2026 Someone' });
  });

  it('treats a blank credit as unconfigured', () => {
    const blank = resolveConfig(
      { ...baseConfig(), footer: { credit: '  ' } },
      '/root',
    );
    expect(blank.footer).toBeUndefined();
  });
});

describe('resolveConfig related', () => {
  it('rejects a depth outside the 1-3 union', () => {
    // JS config files bypass the RelatedDepth union; the resolver guards
    // at runtime. The cast only mirrors that unchecked input.
    const bad = { ...baseConfig(), related: { depth: 4 as RelatedDepth } };
    expect(() => resolveConfig(bad, '/root')).toThrowError(
      /related\.depth must be one of 1, 2, 3, got 4/,
    );
  });

  it('rejects caps below their floor', () => {
    const badNodes = {
      ...baseConfig(),
      related: { maxNodes: 1 },
    };
    expect(() => resolveConfig(badNodes, '/root')).toThrowError(
      /related\.maxNodes must be an integer >= 2, got 1/,
    );
    const badLimit = {
      ...baseConfig(),
      related: { twoHopNodeLimit: 1 },
    };
    expect(() => resolveConfig(badLimit, '/root')).toThrowError(
      /related\.twoHopNodeLimit must be an integer >= 2, got 1/,
    );
  });

  it('applies documented defaults and keeps valid values', () => {
    const { related } = resolveConfig(
      { ...baseConfig(), related: { depth: 2, maxNodes: 10 } },
      '/root',
    );
    expect(related).toEqual({
      depth: 2,
      maxNodes: 10,
      maxEdges: 240,
      twoHopNodeLimit: DEFAULT_TWO_HOP_NODE_LIMIT,
    });
    const kept = resolveConfig(
      {
        ...baseConfig(),
        related: { depth: 2, maxNodes: 10, twoHopNodeLimit: 12 },
      },
      '/root',
    );
    expect(kept.related.twoHopNodeLimit).toBe(12);
  });
});

describe('resolveConfig onScan', () => {
  // The hook travels to SiteStore as a constructor argument (wired by the
  // plugin), never through ResolvedConfig: its SiteScanContext signature
  // mentions ResolvedConfig, and embedding that self-referential function
  // type in the resolved shape blows up deep type comparisons at consumer
  // vite-config boundaries.
  it('keeps onScan out of the resolved config', () => {
    expect('onScan' in resolveConfig(baseConfig(), '/root')).toBe(false);
    expect(
      'onScan' in resolveConfig({ ...baseConfig(), onScan: scanHook }, '/root'),
    ).toBe(false);
  });
});

/** Module-scope hook so the passthrough test compares one stable reference. */
function scanHook(): { pages: number } {
  return { pages: 0 };
}
