import { describe, expect, it } from 'vitest';

import type { LocaleInfo, PagePayload } from '../../../shared/types.ts';
import { baseOf, renderShell, serializeInlineJson } from '../shell.ts';

const LOCALE: LocaleInfo = { key: '', lang: 'zh-CN', label: 'zh', prefix: '' };

function payload(route: string): PagePayload {
  return {
    site: {
      title: 'Site',
      description: 'desc',
      base: baseOf(route),
      locales: [LOCALE],
      locale: '',
    },
    navbar: [],
    sidebar: [],
    page: {
      route,
      locale: '',
      title: 'Hello',
      headings: [],
      frontmatter: {},
      createdAt: null,
      updatedAt: null,
    },
  };
}

function shell(
  route: string,
  extra: Partial<Parameters<typeof renderShell>[0]> = {},
) {
  return renderShell({
    payload: payload(route),
    content: '<p>body</p>',
    scriptSrc: 'assets/entry-1.js',
    cssHrefs: ['assets/entry-1.css'],
    katexHref: 'assets/katex/katex.min.css',
    locale: LOCALE,
    hostname: 'https://example.com',
    ...extra,
  });
}

/** All head stylesheet links, in document order. */
function stylesheetLinks(html: string): string[] {
  return [...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map(m => m[0]);
}

function indexOf(html: string, needle: string): number {
  const i = html.indexOf(needle);
  expect(i, `"${needle}" must be present`).toBeGreaterThanOrEqual(0);
  return i;
}

/** The inline gtag bootstrap script, for context-scoped assertions. */
function inlineGaScript(html: string): string {
  const m = html.match(/<script>window\.dataLayer[\s\S]*?<\/script>/);
  expect(m, 'inline gtag script must be present').not.toBeNull();
  return m![0]!;
}

describe('baseOf route depth', () => {
  it('maps depth 0 routes to the empty base', () => {
    expect(baseOf('/x')).toBe('');
    expect(baseOf('/')).toBe('');
  });

  it('maps one-segment routes, locale homes and directory indexes to ../', () => {
    expect(baseOf('/guide/x')).toBe('../');
    expect(baseOf('/en/x')).toBe('../');
    expect(baseOf('/en/')).toBe('../');
    expect(baseOf('/guide/')).toBe('../');
  });

  it('stacks one ../ per additional path segment', () => {
    expect(baseOf('/en/guide/x')).toBe('../../');
    expect(baseOf('/a/b/c/d')).toBe('../../../');
    expect(baseOf('/a/b/')).toBe('../../');
  });
});

describe('renderShell head ordering', () => {
  it('emits the anti-FOUC script before any stylesheet link', () => {
    const html = shell('/a/b');
    const fouc = indexOf(html, 'localStorage.getItem("ap-theme")');
    const firstCss = indexOf(html, '<link rel="stylesheet"');
    expect(fouc).toBeLessThan(firstCss);
  });

  it('emits stylesheet links before third-party and payload scripts', () => {
    const html = shell('/a', { gaId: 'G-TEST' });
    const lastCss = html.lastIndexOf('<link rel="stylesheet"');
    expect(lastCss).toBeLessThan(indexOf(html, 'googletagmanager.com'));
    expect(lastCss).toBeLessThan(indexOf(html, 'id="__AP_DATA__"'));
    expect(lastCss).toBeLessThan(indexOf(html, '<script type="module"'));
  });

  it('emits the speculation rules script after stylesheets, last in head', () => {
    const html = shell('/a', {
      gaId: 'G-TEST',
      speculationRules: true,
    });
    const rules = indexOf(html, '<script type="speculationrules">');
    expect(rules).toBeGreaterThan(html.lastIndexOf('<link rel="stylesheet"'));
    expect(rules).toBeGreaterThan(indexOf(html, 'googletagmanager.com'));
    expect(rules).toBeLessThan(indexOf(html, '</head>'));
  });

  it('omits the speculation rules script when not requested (dev)', () => {
    expect(shell('/a')).not.toContain('speculationrules');
  });
});

describe('renderShell stylesheet links', () => {
  it('base-prefixes stylesheet hrefs by page depth', () => {
    const deep = stylesheetLinks(shell('/a/b'));
    expect(deep).toEqual([
      '<link rel="stylesheet" href="../assets/katex/katex.min.css">',
      '<link rel="stylesheet" href="../assets/entry-1.css">',
    ]);
    const root = stylesheetLinks(shell('/a'));
    expect(root).toEqual([
      '<link rel="stylesheet" href="assets/katex/katex.min.css">',
      '<link rel="stylesheet" href="assets/entry-1.css">',
    ]);
  });

  it('omits the katex link entirely when katexHref is unset', () => {
    const html = shell('/a/b', { katexHref: undefined });
    expect(html).not.toContain('katex');
    expect(stylesheetLinks(html)).toEqual([
      '<link rel="stylesheet" href="../assets/entry-1.css">',
    ]);
  });

  it('keeps links render-blocking: no media/onload/disabled async hacks', () => {
    const links = stylesheetLinks(shell('/a/b', { speculationRules: true }));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).not.toMatch(/\bmedia=/);
      expect(link).not.toMatch(/\bonload=/);
      expect(link).not.toMatch(/\bdisabled\b/);
      expect(link).not.toMatch(/\brel="preload"/);
    }
  });
});

describe('renderShell speculation rules payload', () => {
  it('contains a valid same-site prerender document rule', () => {
    const html = shell('/a', { speculationRules: true });
    const match = html.match(
      /<script type="speculationrules">(.*?)<\/script>/s,
    );
    expect(match).not.toBeNull();
    const rules = JSON.parse(match![1]!) as {
      prerender: {
        source: string;
        where: Record<string, unknown>;
        eagerness: string;
      }[];
    };
    expect(rules.prerender).toHaveLength(1);
    const rule = rules.prerender[0]!;
    expect(rule.source).toBe('document');
    expect(rule.eagerness).toBe('moderate');
    expect(rule.where).toEqual({
      and: [
        { href_matches: '/*' },
        { not: { href_matches: '/*\\?*' } },
        { not: { selector_matches: 'a[href^="#"]' } },
      ],
    });
  });
});

describe('renderShell ga id embedding', () => {
  it('embeds an id with quotes and ampersands as an intact JSON string', () => {
    const gaId = "G-A'B&C";
    const inline = inlineGaScript(shell('/a', { gaId }));
    expect(inline).toContain(`gtag('config',"G-A'B&C")`);
    expect(inline).not.toContain('&amp;');
  });

  it('escapes a script-closing id so the inline script stays intact', () => {
    const inline = inlineGaScript(shell('/a', { gaId: 'G-</script>' }));
    expect(inline).toContain('G-\\u003c/script>');
    expect(inline.endsWith('</script>')).toBe(true);
  });

  it('keeps attribute-escaping the id in the loader query string', () => {
    const html = shell('/a', { gaId: 'G-A&B"' });
    expect(html).toContain('gtag/js?id=G-A&amp;B&quot;');
  });
});

describe('renderShell title composition', () => {
  it('suffixes a distinct page title with the site title', () => {
    expect(shell('/a')).toContain('<title>Hello | Site</title>');
  });

  it('keeps the bare site title when the page title equals it', () => {
    const same = payload('/a');
    same.page.title = 'Site';
    const html = shell('/a', { payload: same });
    expect(html).toContain('<title>Site</title>');
    expect(html).not.toContain('Site | Site');
    expect(html).toContain('<meta property="og:title" content="Site">');
  });

  it('keeps the bare site title when the page has no h1 title', () => {
    const untitled = payload('/a');
    untitled.page.title = '';
    expect(shell('/a', { payload: untitled })).toContain('<title>Site</title>');
  });
});

describe('renderShell per-page description', () => {
  it('uses the payload excerpt for meta and og description', () => {
    const withExcerpt = payload('/a');
    withExcerpt.page.excerpt = 'Page summary from the rendered body.';
    const html = shell('/a', { payload: withExcerpt });
    expect(html).toContain(
      '<meta name="description" content="Page summary from the rendered body.">',
    );
    expect(html).toContain(
      '<meta property="og:description" content="Page summary from the rendered body.">',
    );
  });

  it('falls back to the site description without an excerpt', () => {
    const html = shell('/a');
    expect(html).toContain('<meta name="description" content="desc">');
    expect(html).toContain('<meta property="og:description" content="desc">');
  });
});

describe('renderShell og:type', () => {
  it('emits website for the locale home and archives, article otherwise', () => {
    const home = payload('/');
    expect(shell('/', { payload: home })).toContain(
      '<meta property="og:type" content="website">',
    );
    const archive = payload('/tag/alpha');
    expect(shell('/tag/alpha', { payload: archive })).toContain(
      '<meta property="og:type" content="website">',
    );
    expect(shell('/a/b')).toContain(
      '<meta property="og:type" content="article">',
    );
  });

  it('resolves the home route against the payload locale prefix', () => {
    const enHome = payload('/en/');
    enHome.site.locale = 'en';
    enHome.site.locales = [
      ...enHome.site.locales,
      { key: 'en', lang: 'en', label: 'en', prefix: '/en' },
    ];
    expect(shell('/en/', { payload: enHome })).toContain(
      '<meta property="og:type" content="website">',
    );
  });
});

describe('renderShell og:image / twitter:card', () => {
  it('emits summary card without og:image when unset', () => {
    const html = shell('/a');
    expect(html).not.toContain('og:image');
    expect(html).toContain('<meta name="twitter:card" content="summary">');
  });

  it('resolves a public-root path against the hostname', () => {
    const html = shell('/a', { ogImage: '/og.png' });
    expect(html).toContain(
      '<meta property="og:image" content="https://example.com/og.png">',
    );
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image">',
    );
  });

  it('normalizes a bare path and passes absolute URLs through', () => {
    expect(shell('/a', { ogImage: 'img/og.png' })).toContain(
      '<meta property="og:image" content="https://example.com/img/og.png">',
    );
    expect(
      shell('/a', { ogImage: 'https://cdn.example.com/og.png' }),
    ).toContain(
      '<meta property="og:image" content="https://cdn.example.com/og.png">',
    );
  });

  it('escapes hostile image values', () => {
    const html = shell('/a', { ogImage: '/o"g><script>' });
    expect(html).toContain(
      '<meta property="og:image" content="https://example.com/o&quot;g&gt;&lt;script&gt;">',
    );
    // The escaped attribute stays one value: no raw quote ends it early.
    expect(html).not.toContain('content="https://example.com/o"g');
  });
});

describe('renderShell rss autodiscovery', () => {
  it('links the always-generated feed with the site title', () => {
    expect(shell('/a/b')).toContain(
      '<link rel="alternate" type="application/rss+xml" title="Site" href="https://example.com/rss.xml">',
    );
  });
});

describe('renderShell hreflang alternates', () => {
  it('emits one link per counterpart plus x-default on the first entry', () => {
    const multi = payload('/guide/a');
    multi.page.alternates = [
      { lang: 'zh-CN', route: '/guide/a' },
      { lang: 'en', route: '/en/guide/a' },
    ];
    const html = shell('/guide/a', { payload: multi });
    expect(html).toContain(
      '<link rel="alternate" hreflang="zh-CN" href="https://example.com/guide/a">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="en" href="https://example.com/en/guide/a">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://example.com/guide/a">',
    );
  });

  it('emits no hreflang links without payload alternates', () => {
    expect(shell('/a')).not.toContain('hreflang');
  });

  it('keeps alternates right after the canonical link', () => {
    const multi = payload('/a');
    multi.page.alternates = [{ lang: 'en', route: '/en/a' }];
    const html = shell('/a', { payload: multi });
    const canonical = indexOf(html, '<link rel="canonical"');
    const first = indexOf(html, 'hreflang="en"');
    expect(canonical).toBeLessThan(first);
  });
});

describe('renderShell payload contract', () => {
  it('keeps SEO meta and the serialized payload intact', () => {
    const html = shell('/a/b');
    expect(html).toContain('<meta property="og:url"');
    expect(html).toContain('<link rel="canonical"');
    const data = html.match(
      /<script type="application\/json" id="__AP_DATA__">(.*?)<\/script>/s,
    );
    expect(data).not.toBeNull();
    const parsed = JSON.parse(data![1]!) as PagePayload;
    expect(parsed.page.route).toBe('/a/b');
    expect(parsed.site.base).toBe('../');
  });
});

describe('serializeInlineJson script-safety', () => {
  it('escapes every < so no sequence can close the host script', () => {
    const hostile = [
      '</script><script>alert(1)</script>',
      '<!-- "-->',
      '<script>',
      'a<b<c',
    ];
    for (const value of hostile) {
      const serialized = serializeInlineJson(value);
      expect(serialized).not.toContain('<');
      expect(JSON.parse(serialized)).toBe(value);
    }
  });

  it('escapes quotes as JSON escapes, keeping strings round-trippable', () => {
    const value = 'he said "hi" \\ and left';
    const serialized = serializeInlineJson(value);
    expect(JSON.parse(serialized)).toBe(value);
    // A raw unescaped quote would end the JSON string early.
    expect(serialized).toBe(JSON.stringify(value));
  });

  it('round-trips U+2028/U+2029 line separators unchanged', () => {
    const value = 'first\u2028second\u2029third';
    const serialized = serializeInlineJson(value);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toBe(value);
  });
});

describe('renderShell hostile payload embedding', () => {
  it('cannot break out of the payload script tag', () => {
    const hostile = payload('/x');
    hostile.site.description = '</script><!-- "-->';
    hostile.page.title = '<script>"&';
    const html = shell('/x', { payload: hostile });
    const data = html.match(
      /<script type="application\/json" id="__AP_DATA__">(.*?)<\/script>/s,
    );
    expect(data).not.toBeNull();
    // Every `<` is `\u003c`: the non-greedy match reached the real closer.
    expect(data![1]).not.toContain('<');
    expect(data![1]).not.toContain('<!--');
    expect(JSON.parse(data![1]!) as PagePayload).toEqual(hostile);
  });

  it('round-trips U+2028/U+2029 inside embedded strings', () => {
    const payload2028 = payload('/x');
    payload2028.page.title = 'a\u2028b\u2029c';
    const html = shell('/x', { payload: payload2028 });
    const data = html.match(
      /<script type="application\/json" id="__AP_DATA__">(.*?)<\/script>/s,
    );
    expect(data).not.toBeNull();
    expect(JSON.parse(data![1]!) as PagePayload).toEqual(payload2028);
  });
});

describe('renderShell meta attribute escaping', () => {
  it('entity-escapes <, >, & and " in title and description', () => {
    const hostile = payload('/x');
    hostile.page.title = 'T>&"';
    hostile.site.title = 'S<b>';
    hostile.site.description = 'D<!--"-->';
    const html = shell('/x', { payload: hostile });
    // Composed title "T>&\" | S<b>" must land entity-escaped.
    const escapedTitle = 'T&gt;&amp;&quot; | S&lt;b&gt;';
    expect(html).toContain(`<title>${escapedTitle}</title>`);
    expect(html).toContain(
      `<meta property="og:title" content="${escapedTitle}">`,
    );
    expect(html).toContain(
      '<meta name="description" content="D&lt;!--&quot;--&gt;">',
    );
    expect(html).toContain(
      '<meta property="og:description" content="D&lt;!--&quot;--&gt;">',
    );
    // No raw hostile characters inside the head meta block.
    expect(html).not.toContain('<title>T>');
    expect(html).not.toContain('content="D<!--');
  });
});
