import fs from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { resolveConfig, type ResolvedConfig } from '../../config.ts';
import { devFsUrl } from '../assets.ts';
import { clientEntry } from '../clientEntry.ts';
import { SiteStore } from '../site.ts';

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(
    tmpDirs.map(dir => rm(dir, { recursive: true, force: true })),
  );
});

interface Fixture {
  root: string;
  config: ResolvedConfig;
  /** Absolute path of a content file. */
  abs(rel: string): string;
}

/** rss.xml content of an emitAll result. */
function rssOf(
  files: {
    fileName: string;
    source: string | Buffer;
  }[],
): string {
  return String(files.find(f => f.fileName === 'rss.xml')?.source ?? '');
}

/** Parsed __AP_DATA__ payload of an emitted page html. */
function payloadOf(html: string): Record<string, unknown> {
  const json =
    /<script type="application\/json" id="__AP_DATA__">(.*?)<\/script>/.exec(
      html,
    )?.[1] ?? '';
  return JSON.parse(json) as Record<string, unknown>;
}

/** Minimal PNG (signature + IHDR) for image-dimension fixtures. */
function pngBytes(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

async function contentFixture(files: Record<string, string>): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ap-store-'));
  tmpDirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([rel, body]) => {
      await mkdir(path.dirname(path.join(root, 'content', rel)), {
        recursive: true,
      });
      await writeFile(path.join(root, 'content', rel), body);
    }),
  );
  const config = resolveConfig(
    {
      contentDir: 'content',
      title: 'Site',
      description: 'desc',
      hostname: 'https://test.example.com',
    },
    root,
  );
  return { root, config, abs: rel => path.join(root, 'content', rel) };
}

describe('SiteStore', () => {
  it('serves page html for url routes and null for unknown ones', async () => {
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'guide/index.md': '# G\n',
      'guide/a.md': '[back](./index.md)\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('dev');

    const home = store.devHtml('/');
    expect(home).toContain('Home');
    expect(home).toContain('id="__AP_DATA__"');
    // Dev pages embed the framework entry as a /@fs/ module url.
    expect(home).toContain(
      `<script type="module" src="${devFsUrl(clientEntry())}">`,
    );

    const article = store.devHtml('/guide/a');
    // Internal link rewritten page-relative; ./index.md resolves to the
    // sibling directory index (guide/index.md -> the clean route /guide/).
    expect(article).toContain('<a href="./">back</a>');

    // Trailing slash resolves to the directory index.
    expect(store.devHtml('/guide/')).toContain('G');
    expect(store.devHtml('/nope')).toBeNull();
    // Legacy .html URLs are a production-host concern; dev 404s them.
    expect(store.devHtml('/guide/a.html')).toBeNull();
  });

  it('caches by mtime and invalidate() accepts watcher-style posix paths', async () => {
    const fx = await contentFixture({ 'a.md': 'first\n' });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    // Pin the mtime: a rewrite that restores it must stay a cache hit.
    fs.utimesSync(fx.abs('a.md'), new Date(1000), new Date(1000));
    expect(store.devHtml('/a')).toContain('first');

    fs.writeFileSync(fx.abs('a.md'), 'second\n');
    fs.utimesSync(fx.abs('a.md'), new Date(1000), new Date(1000));
    // Same mtime -> render cache still serves the stale content.
    expect(store.devHtml('/a')).toContain('first');

    // Watcher paths may arrive with posix separators even on Windows.
    store.invalidate(fx.abs('a.md').split(path.sep).join('/'));
    expect(store.devHtml('/a')).toContain('second');
  });

  it('resync drops every render cache regardless of mtime', async () => {
    const fx = await contentFixture({ 'a.md': 'first\n' });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    fs.utimesSync(fx.abs('a.md'), new Date(1000), new Date(1000));
    expect(store.devHtml('/a')).toContain('first');

    fs.writeFileSync(fx.abs('a.md'), 'second\n');
    fs.utimesSync(fx.abs('a.md'), new Date(1000), new Date(1000));
    await store.resync('dev');
    expect(store.devHtml('/a')).toContain('second');
  });

  it('dev trusts the watcher: warm cache hits make zero stat calls', async () => {
    const fx = await contentFixture({ 'a.md': '# A\n', 'b.md': '# B\n' });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    // Warm the cache; only misses may stat.
    store.devHtml('/a');
    store.devHtml('/b');

    const stat = vi.spyOn(fs, 'statSync');
    try {
      // Page requests and rss() reuse the cache without freshness stats;
      // the watcher's invalidate()/resync() owns dev freshness instead.
      store.devHtml('/a');
      store.devHtml('/b');
      store.rss();
      expect(stat).not.toHaveBeenCalled();
    } finally {
      stat.mockRestore();
    }
  });

  it('build keeps the per-page mtime stat even after a dev sync', async () => {
    const fx = await contentFixture({ 'a.md': '# A\n', 'b.md': '# B\n' });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    store.devHtml('/a');
    // Flip to build mode; sync keeps surviving cache entries, so freshness
    // must fall back to the mtime check (no watcher during generateBundle).
    await store.sync('build');

    const stat = vi.spyOn(fs, 'statSync');
    try {
      store.emitAll({
        isBuild: true,
        scriptFile: 'assets/entry.js',
        cssFiles: [],
      });
      expect(stat.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      stat.mockRestore();
    }
  });

  it('collects dead and bare links from rendered pages', async () => {
    const fx = await contentFixture({
      'a.md': '[dead](./missing.md)\n\n[bare](b.md)\n',
      'b.md': '# B\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    store.devHtml('/a');

    const dead = store.deadLinks();
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ raw: './missing.md' });
    expect(dead[0]?.file.endsWith('a.md')).toBe(true);
    expect(dead[0]?.line).toBeGreaterThan(0);

    const bare = store.bareLinks();
    expect(bare).toHaveLength(1);
    expect(bare[0]).toMatchObject({ raw: 'b.md' });
    expect(bare[0]?.line).toBeGreaterThan(0);
  });

  it('dev warns once per served page about dead links and unknown icons', async () => {
    const fx = await contentFixture({
      'a.md': '---\nicon: ghost\n---\n\n[dead](./missing.md)\n',
      'b.md': '[dead](./missing.md)\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Serving the page warns about its own dead link and icon; the page
      // still renders (dev stays browsable).
      const html = store.devHtml('/a');
      expect(html).toContain('dead');
      const calls = (): string[] => warn.mock.calls.map(c => String(c[0]));
      expect(
        calls().some(m => m.includes('dead link(s)') && m.includes('a.md')),
      ).toBe(true);
      expect(calls().some(m => m.includes('icon "ghost"'))).toBe(true);

      // Repeated requests of the same page stay silent.
      warn.mockClear();
      expect(store.devHtml('/a')).toBeDefined();
      expect(warn).not.toHaveBeenCalled();

      // Another page's identical dead link warns on its own request only.
      store.devHtml('/b');
      expect(calls().some(m => m.includes('b.md'))).toBe(true);
      expect(calls().some(m => m.includes('a.md'))).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('renders the rss feed and honours feed:false', async () => {
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'p.md': '---\ndate: 2024-01-01\n---\n\n# Post\n',
      'hidden.md': '---\ndate: 2024-01-02\nfeed: false\n---\n\n# Hidden\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    const rss = store.rss();
    expect(rss).toContain('<rss');
    expect(rss).toContain('https://test.example.com/p');
    expect(rss).not.toContain('hidden');
  });

  it('keeps `related` off home payloads either way the feed is configured', async () => {
    // The home links a post, so its related map entry is non-empty — yet the
    // related graph is article-tail chrome: locale homes never carry
    // `related` in the payload (the client's mountRelatedGraph skips
    // website pages via the same seoPageType predicate).
    const files = { 'index.md': '# Home\n\n[go](./a.md)\n', 'a.md': '# A\n' };

    const feedSite = await contentFixture(files);
    const feedStore = new SiteStore(feedSite.config);
    await feedStore.sync('build');
    const feedFiles = feedStore.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: [],
    });
    const homePayload = payloadOf(
      String(feedFiles.find(f => f.fileName === 'index.html')?.source ?? ''),
    );
    expect(homePayload.articles).toBeDefined();
    expect(homePayload.related).toBeUndefined();

    const articlePayload = payloadOf(
      String(feedFiles.find(f => f.fileName === 'a.html')?.source ?? ''),
    );
    // Articles keep the graph: the home counts as a neighbor of the post.
    expect(articlePayload.related).toBeDefined();

    // feed:false homes carry neither articles nor related.
    const plainSite = await contentFixture(files);
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 'Site',
        description: 'desc',
        hostname: 'https://test.example.com',
        home: { feed: false },
      },
      plainSite.root,
    );
    const plainStore = new SiteStore(config);
    await plainStore.sync('build');
    const plainFiles = plainStore.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: [],
    });
    const landingPayload = payloadOf(
      String(plainFiles.find(f => f.fileName === 'index.html')?.source ?? ''),
    );
    expect(landingPayload.articles).toBeUndefined();
    expect(landingPayload.related).toBeUndefined();
    const stillArticle = payloadOf(
      String(plainFiles.find(f => f.fileName === 'a.html')?.source ?? ''),
    );
    expect(stillArticle.related).toBeDefined();
  });

  it('serves category and tag archive routes in dev', async () => {
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'post.md':
        '---\ndate: 2024-01-01\ncategory:\n  - news\ntag:\n  - alpha\n---\n\n# Post\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('dev');

    const archive = store.devHtml('/category/news');
    expect(archive).toContain('<h1>news</h1>');
    expect(store.devHtml('/tag/alpha')).toContain('<h1>alpha</h1>');
    // Unknown archive names fall through to null (no page, no archive).
    expect(store.devHtml('/category/nope')).toBeNull();
  });

  it('emitAll returns pages, archives, feeds and static assets', async () => {
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'post.md':
        '---\ndate: 2024-01-01\ncategory:\n  - news\ntag:\n  - alpha\n---\n\n# Post\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('build');
    const files = store.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: ['assets/app.css'],
    });
    const names = files.map(f => f.fileName);
    expect(names).toEqual(
      expect.arrayContaining([
        'index.html',
        'post.html',
        'category/news.html',
        'tag/alpha.html',
        'rss.xml',
        'sitemap.xml',
        'robots.txt',
        '404.html',
      ]),
    );
    // No math in the fixture: no katex css link and no katex assets at all.
    expect(names).not.toContain('assets/katex/katex.min.css');

    const html = String(
      files.find(f => f.fileName === 'post.html')?.source ?? '',
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://test.example.com/post">',
    );
    expect(html).toContain('<link rel="stylesheet" href="assets/app.css">');
    expect(html).toContain('<script type="module" src="assets/entry.js">');
    expect(html).not.toContain('assets/katex/katex.min.css');
    expect(rssOf(files)).toContain('https://test.example.com/post');
  });

  it('emits canonical bare directory-index URLs under urls.directoryIndex: bare', async () => {
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'guide/index.md': '# G\n',
      'guide/a.md': '# A\n',
    });
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 'Site',
        description: 'desc',
        hostname: 'https://test.example.com',
        urls: { directoryIndex: 'bare' },
      },
      fx.root,
    );
    const store = new SiteStore(config);
    await store.sync('build');
    const files = store.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: [],
    });
    // File names never change; only the canonical URLs do.
    const names = files.map(f => f.fileName);
    expect(names).toEqual(
      expect.arrayContaining([
        'index.html',
        'guide/index.html',
        'guide/a.html',
      ]),
    );
    const dirIndex = String(
      files.find(f => f.fileName === 'guide/index.html')?.source ?? '',
    );
    expect(dirIndex).toContain(
      '<link rel="canonical" href="https://test.example.com/guide">',
    );
    const leaf = String(
      files.find(f => f.fileName === 'guide/a.html')?.source ?? '',
    );
    expect(leaf).toContain(
      '<link rel="canonical" href="https://test.example.com/guide/a">',
    );
  });
  it('emitAll ships a standalone noindex 404 page in the default locale', async () => {
    const fx = await contentFixture({ 'index.md': '# Home\n' });
    const store = new SiteStore(fx.config);
    await store.sync('build');
    const files = store.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: [],
    });
    const html = String(
      files.find(f => f.fileName === '404.html')?.source ?? '',
    );
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('prefers-color-scheme');
    expect(html).toContain('href="/"');
    // Fully inline: served at any URL depth, so no external references.
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link');
    // The fallback URL set is open-ended; it never enters the sitemap.
    const sitemap = String(
      files.find(f => f.fileName === 'sitemap.xml')?.source ?? '',
    );
    expect(sitemap).not.toContain('404');
  });

  it('a content 404.md wins over the generated fallback page', async () => {
    const fx = await contentFixture({ '404.md': '# Lost\n' });
    const store = new SiteStore(fx.config);
    await store.sync('build');
    const files = store.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: [],
    });
    const own = files.filter(f => f.fileName === '404.html');
    expect(own).toHaveLength(1);
    // The real page shell (payload script), not the standalone fallback.
    expect(String(own[0]?.source ?? '')).toContain('id="__AP_DATA__"');
    // The override page keeps its open-ended URL set out of the sitemap.
    const sitemap = String(
      files.find(f => f.fileName === 'sitemap.xml')?.source ?? '',
    );
    expect(sitemap).not.toContain('404');
  });

  it('keeps gated pages out of the sitemap and disallows string rules in robots.txt', async () => {
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'secret.md': '# S\n',
      're/x.md': '# X\n',
    });
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 'Site',
        description: 'desc',
        hostname: 'https://test.example.com',
        encrypt: [
          { match: '/secret', passwords: ['pw'] },
          { match: /^\/re\//, passwords: ['pw'] },
        ],
      },
      fx.root,
    );
    const store = new SiteStore(config);
    await store.sync('build');
    const files = store.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: [],
    });
    // The pages still build (the gate is client-side) but leave the sitemap.
    const names = files.map(f => f.fileName);
    expect(names).toContain('secret.html');
    expect(names).toContain('re/x.html');
    const sitemap = String(
      files.find(f => f.fileName === 'sitemap.xml')?.source ?? '',
    );
    expect(sitemap).toContain('<loc>https://test.example.com/</loc>');
    expect(sitemap).not.toContain('secret');
    expect(sitemap).not.toContain('re/x');
    const robots = String(
      files.find(f => f.fileName === 'robots.txt')?.source ?? '',
    );
    expect(robots).toContain('Disallow: /secret');
    // RegExp rules cannot be expressed as robots patterns.
    expect(robots).not.toContain('re/');
  });

  it('keeps seo.exclude prefixes out of the sitemap and disallowed in robots.txt', async () => {
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'hide/a.md': '# A\n',
      'hide/deep/b.md': '# B\n',
      'show.md': '# S\n',
    });
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 'Site',
        description: 'desc',
        hostname: 'https://test.example.com',
        seo: { exclude: ['/hide'] },
      },
      fx.root,
    );
    const store = new SiteStore(config);
    await store.sync('build');
    const files = store.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: [],
    });
    // Excluded pages still build; they just stay uncrawled.
    const names = files.map(f => f.fileName);
    expect(names).toContain('hide/a.html');
    const sitemap = String(
      files.find(f => f.fileName === 'sitemap.xml')?.source ?? '',
    );
    expect(sitemap).not.toContain('hide');
    expect(sitemap).toContain('https://test.example.com/show');
    const robots = String(
      files.find(f => f.fileName === 'robots.txt')?.source ?? '',
    );
    expect(robots).toContain('Disallow: /hide');
  });

  it('emits a Cloudflare Pages _headers only when deploy.cloudflare is on', async () => {
    const fx = await contentFixture({ 'index.md': '# Home\n' });
    const assets = {
      isBuild: true,
      scriptFile: 'assets/entry-a1b2.js',
      cssFiles: [],
    };

    const plain = new SiteStore(fx.config);
    await plain.sync('build');
    const plainNames = plain.emitAll(assets).map(f => f.fileName);
    expect(plainNames).not.toContain('_headers');

    const cfConfig = resolveConfig(
      {
        contentDir: 'content',
        title: 'Site',
        description: 'desc',
        hostname: 'https://test.example.com',
        deploy: { cloudflare: true },
      },
      fx.root,
    );
    const cf = new SiteStore(cfConfig);
    await cf.sync('build');
    const files = cf.emitAll(assets);
    const headers = String(
      files.find(f => f.fileName === '_headers')?.source ?? '',
    );
    // Content-hashed assets get immutable caching; the entry file name is
    // plumbed from the build bundle into the modulepreload Link header.
    expect(headers).toContain('/assets/*');
    expect(headers).toContain(
      'Cache-Control: public, max-age=31536000, immutable',
    );
    // Fixed-name katex assets get a short cache instead of immutable.
    expect(headers).toContain('/assets/katex/*');
    expect(headers).toContain('Cache-Control: public, max-age=86400');
    expect(headers).toContain(
      'Link: </assets/entry-a1b2.js>; rel=modulepreload',
    );
  });

  it('injects the katex stylesheet on math pages only (dev)', async () => {
    const fx = await contentFixture({
      'math.md': '# Math\n\n$E=mc^2$\n',
      'plain.md': '# Plain\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    // Dev serves the css straight from the package via a /@fs url.
    expect(store.devHtml('/math')).toContain('katex.min.css');
    expect(store.devHtml('/plain')).not.toContain('katex.min.css');
  });

  it('emits katex assets and links them on math pages only (build)', async () => {
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'math.md': '---\ncategory:\n  - sci\n---\n\n# Math\n\n$E=mc^2$\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('build');
    const files = store.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: ['assets/app.css'],
    });
    const names = files.map(f => f.fileName);
    expect(names).toContain('assets/katex/katex.min.css');
    // Modern browsers stop at the first supported @font-face src (woff2):
    // the legacy woff/ttf fallbacks never ship.
    for (const name of names.filter(n => n.startsWith('assets/katex/fonts/'))) {
      expect(name.endsWith('.woff2')).toBe(true);
    }
    const mathHtml = String(
      files.find(f => f.fileName === 'math.html')?.source ?? '',
    );
    const homeHtml = String(
      files.find(f => f.fileName === 'index.html')?.source ?? '',
    );
    expect(mathHtml).toContain(
      '<link rel="stylesheet" href="assets/katex/katex.min.css">',
    );
    expect(homeHtml).not.toContain('katex.min.css');
    // Archive pages list articles without rendering them: no math, no link.
    const archiveHtml = String(
      files.find(f => f.fileName === 'category/sci.html')?.source ?? '',
    );
    expect(archiveHtml).not.toContain('katex.min.css');
  });

  it('emits hreflang alternates for mirrored pages only', async () => {
    // zh/en mirror index.md and guide/a.md; zh-only.md and en/only.md have
    // no counterpart, so they must not advertise alternates.
    const fx = await contentFixture({
      'index.md': '# Home\n',
      'guide/a.md': '# A\n',
      'zh-only.md': '# Z\n',
      'en/index.md': '# Home\n',
      'en/guide/a.md': '# A\n',
      'en/only.md': '# O\n',
    });
    // Give the site a second locale by rewriting the config locales.
    const config = resolveConfig(
      {
        contentDir: 'content',
        title: 'Site',
        description: 'desc',
        hostname: 'https://test.example.com',
        locales: { en: { lang: 'en', label: 'en' } },
      },
      fx.root,
    );
    const store = new SiteStore(config);
    await store.sync('build');
    const files = store.emitAll({
      isBuild: true,
      scriptFile: 'assets/entry.js',
      cssFiles: [],
    });
    const source = (name: string): string =>
      String(files.find(f => f.fileName === name)?.source ?? '');

    const zhA = source('guide/a.html');
    expect(zhA).toContain(
      '<link rel="alternate" hreflang="zh-CN" href="https://test.example.com/guide/a">',
    );
    expect(zhA).toContain(
      '<link rel="alternate" hreflang="en" href="https://test.example.com/en/guide/a">',
    );
    expect(zhA).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://test.example.com/guide/a">',
    );
    // The en mirror carries the same set.
    expect(source('en/guide/a.html')).toContain('hreflang="zh-CN"');

    // Counterpart-less pages emit no hreflang links at all.
    expect(source('zh-only.html')).not.toContain('hreflang');
    expect(source('en/only.html')).not.toContain('hreflang');

    // The sitemap mirrors the head: alternates only where counterparts exist.
    const sitemap = source('sitemap.xml');
    expect(sitemap).toContain('xmlns:xhtml=');
    expect(sitemap).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://test.example.com/en/guide/a"/>',
    );
    const zhOnlyEntry = sitemap.match(
      /<url><loc>https:\/\/test\.example\.com\/zh-only<\/loc>(.*?)<\/url>/,
    )?.[1];
    expect(zhOnlyEntry).toBeDefined();
    expect(zhOnlyEntry!).not.toContain('xhtml:link');
  });

  it('injects local image dimensions and leaves remote images alone', async () => {
    const fx = await contentFixture({
      'a.md': '![pic](./pic.png)\n\n![remote](https://example.com/x.png)\n',
    });
    await writeFile(fx.abs('pic.png'), pngBytes(3, 2));
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    const html = store.devHtml('/a') ?? '';
    // The local image carries its intrinsic size for CLS-free layout.
    expect(html).toContain('width="3"');
    expect(html).toContain('height="2"');
    // Remote images stay untouched.
    const remote = /<img [^>]*example\.com[^>]*>/.exec(html)?.[0] ?? '';
    expect(remote).toContain('src="https://example.com/x.png"');
    expect(remote).not.toContain('width=');
  });

  it('emitAll rejects frontmatter icons missing from the config icons map', async () => {
    const fx = await contentFixture({
      'a.md': '---\nicon: ghost\n---\n\n# A\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('build');
    expect(() =>
      store.emitAll({
        isBuild: true,
        scriptFile: 'assets/entry.js',
        cssFiles: [],
      }),
    ).toThrowError(/icon\(s\) not registered[\s\S]*icon "ghost"/);
  });

  it('emitAll rejects archive routes colliding with real pages', async () => {
    // The locale home is not an article, so its categories build no archive;
    // a regular post's category collides with the page of the same name.
    const fx = await contentFixture({
      'post.md': '---\ncategory:\n  - news\n---\n\n# Post\n',
      'category/news.md': '# News\n',
    });
    const store = new SiteStore(fx.config);
    await store.sync('build');
    expect(() =>
      store.emitAll({
        isBuild: true,
        scriptFile: 'assets/entry.js',
        cssFiles: [],
      }),
    ).toThrowError(/duplicate route \/category\/news/);
  });

  it('dev sync warns once about archive collisions and stays browsable', async () => {
    // Same fixture as the build-throw test above; here dev must warn (once)
    // instead of failing, and keep the page browsable.
    const fx = await contentFixture({
      'post.md': '---\ncategory:\n  - news\n---\n\n# Post\n',
      'category/news.md': '# News\n',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const store = new SiteStore(fx.config);
      // Dev must not fail the sync the way build does.
      await expect(store.sync('dev')).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(
        /duplicate route \/category\/news[\s\S]*build will fail/,
      );
      // The page still wins the route in dev (browsable).
      expect(store.devHtml('/category/news')).toContain('News');

      // An identical resync (unchanged content) must not re-print the warning.
      await store.resync('dev');
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('sync rejects duplicate routes from index.md and README.md', async () => {
    const fx = await contentFixture({
      'guide/index.md': '# G\n',
      'guide/README.md': '# G\n',
    });
    const store = new SiteStore(fx.config);
    await expect(store.sync('dev')).rejects.toThrowError(
      /duplicate route \/guide\//,
    );
  });

  it('refreshes the renderer when an edit introduces a new fence language', async () => {
    const fx = await contentFixture({ 'a.md': '```ts\nx\n```\n' });
    const store = new SiteStore(fx.config);
    await store.sync('dev');
    // shikiLangs ['ts']: the stub highlights the fence as language-ts.
    expect(store.devHtml('/a')).toContain('language-ts');

    // Same-language edit: the refresh gate stays a no-op...
    fs.writeFileSync(fx.abs('a.md'), '```ts\ny\n```\n');
    store.invalidate(fx.abs('a.md'));
    await store.refreshRenderer();
    expect(store.devHtml('/a')).toContain('language-ts');

    // New language: without a rebuild the stub falls back to plain text
    // (language-text); the gate must rebuild with the fresh scan instead.
    fs.writeFileSync(fx.abs('a.md'), '```rust\nfn x() {}\n```\n');
    store.invalidate(fx.abs('a.md'));
    expect(store.devHtml('/a')).toContain('language-text');
    await store.refreshRenderer();
    expect(store.devHtml('/a')).toContain('language-rust');
  });
});
