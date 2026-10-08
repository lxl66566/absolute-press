import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';

import { seoPageType } from '../../../shared/seo';
import type { PagePayload } from '../../../shared/types';
import { applyHead, headPatchOf } from '../head';

function payload(
  route: string,
  overrides: {
    excerpt?: string;
    alternates?: PagePayload['page']['alternates'];
  } = {},
): PagePayload {
  return {
    site: {
      title: 'S',
      description: 'site description',
      base: '',
      locales: [
        { key: 'root', lang: 'zh-CN', label: 'zh', prefix: '' },
        { key: 'en', lang: 'en', label: 'en', prefix: '/en' },
      ],
      locale: 'root',
    },
    navbar: [],
    sidebar: [],
    page: {
      route,
      locale: 'root',
      title: 'T',
      headings: [],
      frontmatter: {},
      createdAt: null,
      updatedAt: null,
      ...(overrides.excerpt ? { excerpt: overrides.excerpt } : {}),
      ...(overrides.alternates ? { alternates: overrides.alternates } : {}),
    },
  };
}

/** Shell-shaped head: the tags renderShell emits for a plain article. */
const SHELL_HEAD = `
<html lang="zh-CN"><head>
<meta charset="utf-8">
<title>Old | S</title>
<meta name="description" content="old site description">
<link rel="canonical" href="https://old.example/old">
<meta property="og:type" content="article">
<meta property="og:title" content="Old | S">
<meta property="og:description" content="old site description">
<meta property="og:url" content="https://old.example/old">
<meta property="og:site_name" content="S">
</head><body></body></html>`;

function doc(): Document {
  return parseHTML(SHELL_HEAD).document;
}

describe('headPatchOf', () => {
  it('prefers the page excerpt and composes canonical from the origin', () => {
    const patch = headPatchOf(
      payload('/guide/a', { excerpt: 'page summary' }),
      'https://live.example',
      'A | S',
    );
    expect(patch.description).toBe('page summary');
    expect(patch.canonical).toBe('https://live.example/guide/a');
    expect(patch.ogTitle).toBe('A | S');
  });

  it('falls back to the site description without an excerpt', () => {
    expect(headPatchOf(payload('/a'), 'https://x', 't').description).toBe(
      'site description',
    );
  });

  it('derives og:type from the payload route', () => {
    expect(headPatchOf(payload('/'), 'https://x', 't').ogType).toBe('website');
    expect(headPatchOf(payload('/tag/x'), 'https://x', 't').ogType).toBe(
      'website',
    );
    expect(headPatchOf(payload('/a'), 'https://x', 't').ogType).toBe('article');
  });

  it('absolutizes alternate routes against the origin', () => {
    const patch = headPatchOf(
      payload('/a', {
        alternates: [
          { lang: 'zh-CN', route: '/a' },
          { lang: 'en', route: '/en/a' },
        ],
      }),
      'https://x',
      't',
    );
    expect(patch.alternates).toEqual([
      { lang: 'zh-CN', href: 'https://x/a' },
      { lang: 'en', href: 'https://x/en/a' },
    ]);
  });
});

describe('applyHead', () => {
  it('rewrites description, canonical and og tags to the new page', () => {
    const d = doc();
    applyHead(
      headPatchOf(
        payload('/guide/a', { excerpt: 'new summary' }),
        'https://live.example',
        'A | S',
      ),
      d,
    );
    expect(
      d.querySelector('meta[name="description"]')?.getAttribute('content'),
    ).toBe('new summary');
    expect(d.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://live.example/guide/a',
    );
    expect(
      d.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    ).toBe('A | S');
    expect(
      d
        .querySelector('meta[property="og:description"]')
        ?.getAttribute('content'),
    ).toBe('new summary');
    expect(
      d.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    ).toBe('https://live.example/guide/a');
    expect(
      d.querySelector('meta[property="og:type"]')?.getAttribute('content'),
    ).toBe('article');
  });

  it('rebuilds the hreflang set after the canonical link, x-default last', () => {
    const d = doc();
    applyHead(
      headPatchOf(
        payload('/guide/a', {
          alternates: [
            { lang: 'zh-CN', route: '/guide/a' },
            { lang: 'en', route: '/en/guide/a' },
          ],
        }),
        'https://x',
        't',
      ),
      d,
    );
    const hreflangs = [
      ...d.querySelectorAll('link[rel="alternate"][hreflang]'),
    ];
    expect(hreflangs.map(l => l.getAttribute('hreflang'))).toEqual([
      'zh-CN',
      'en',
      'x-default',
    ]);
    expect(hreflangs[2]!.getAttribute('href')).toBe('https://x/guide/a');
    // Position: directly after the canonical link.
    const siblings = [...d.head!.children];
    expect(siblings.indexOf(hreflangs[0]!)).toBe(
      siblings.indexOf(d.querySelector('link[rel="canonical"]')!) + 1,
    );
  });

  it('drops stale hreflang links when the target page has none', () => {
    const d = doc();
    d.head!.insertAdjacentHTML(
      'beforeend',
      '<link rel="alternate" hreflang="en" href="https://old.example/en/old">',
    );
    applyHead(headPatchOf(payload('/a'), 'https://x', 't'), d);
    expect(d.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(
      0,
    );
  });

  it('never invents tags the shell does not emit', () => {
    const d = parseHTML(
      '<html><head><title>t</title></head><body></body></html>',
    ).document;
    applyHead(headPatchOf(payload('/a'), 'https://x', 't'), d);
    expect(d.querySelector('meta[name="description"]')).toBeNull();
    expect(d.querySelector('link[rel="canonical"]')).toBeNull();
    expect(d.querySelector('meta[property^="og:"]')).toBeNull();
    expect(d.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(
      0,
    );
  });
});

describe('applyHead matches the SSG og:type', () => {
  it('flips to website on soft navigation to a locale home', () => {
    const d = doc();
    const home = payload('/');
    expect(seoPageType(home)).toBe('website');
    applyHead(headPatchOf(home, 'https://x', 'S'), d);
    expect(
      d.querySelector('meta[property="og:type"]')?.getAttribute('content'),
    ).toBe('website');
  });
});
