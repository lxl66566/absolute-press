import fs from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveConfig } from '../../config.ts';
import type { ResolvedConfig } from '../../config.ts';
import type { VirtualPageInput } from '../../config.ts';
import {
  dateFieldIso,
  scanFile,
  scanSite,
  siteScanContext,
  virtualPageEntry,
} from '../scan.ts';

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
  );
});

/** Content fixture on disk, resolved through a site config. */
async function scanFixture(
  files: Record<string, string>,
  overrides: Partial<Parameters<typeof resolveConfig>[0]> = {},
): Promise<{ config: ResolvedConfig; abs: (rel: string) => string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ap-scan-'));
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
      ...overrides,
    },
    root,
  );
  return { config, abs: rel => path.join(root, 'content', rel) };
}

describe('scanSite', () => {
  it('walks the tree and reads every file exactly once', async () => {
    const { config } = await scanFixture({
      'index.md': '---\ntitle-ish: no\n---\n# Home\n',
      'guide/a.md': '---\ncategory: Rust\ntag: [x, y]\n---\n# A\n',
      'guide/sub/b.md': '# B\n',
      'notes.txt': 'ignored\n',
    });
    // The tree scan reads through fs.promises; spy the same API to prove
    // the single read per file.
    const readSpy = vi.spyOn(fs.promises, 'readFile');
    const scan = await scanSite(config);

    expect(scan.sources.map(p => p.relPath)).toEqual([
      'guide/a.md',
      'guide/sub/b.md',
      'index.md',
    ]);
    // One read per markdown file; the .txt never enters the tree.
    expect(
      readSpy.mock.calls.filter(c => String(c[0]).endsWith('.md')),
    ).toHaveLength(3);
    expect(scan.files.size).toBe(3);
  });

  it('carries normalized frontmatter, raw keys and fence languages per file', async () => {
    const { config, abs } = await scanFixture({
      'a.md': [
        '---',
        'date: 2024-05-01',
        'category: Rust',
        'tag: [x, y]',
        'icon: solid/code',
        'custom: 42',
        '---',
        '```rust',
        'fn main() {}',
        '```',
        '',
      ].join('\n'),
    });
    const scan = await scanSite(config);
    const file = scan.files.get(abs('a.md'));
    expect(file).toBeDefined();
    expect(file!.frontmatter).toEqual({
      date: '2024-05-01',
      category: ['Rust'],
      tag: ['x', 'y'],
      icon: 'solid/code',
    });
    // rawFrontmatter keeps yaml-native values: a bare date parses to a Date
    // (the normalized copy above carries the string) and unknown keys survive.
    expect(file!.rawFrontmatter.custom).toBe(42);
    expect(file!.rawFrontmatter.date).toBeInstanceOf(Date);
    expect(file!.fenceLangs).toEqual(['rust']);
    expect(file!.source).toContain('fn main()');
    expect(typeof file!.mtimeMs).toBe('number');
  });

  it('warns about unknown frontmatter keys once per scanned file', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { config } = await scanFixture({
        'a.md': '---\ntags: typo\n---\n# A\n',
      });
      await scanSite(config);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('tags');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('scanFile', () => {
  it('parses a file without frontmatter as empty meta', async () => {
    const { abs } = await scanFixture({ 'plain.md': '# No frontmatter\n' });
    const file = scanFile(abs('plain.md'));
    expect(file.frontmatter).toEqual({});
    expect(file.rawFrontmatter).toEqual({});
    expect(file.fenceLangs).toEqual([]);
  });
});

describe('dateFieldIso', () => {
  it('maps a frontmatter date field to ISO and absent/unparsable to null, silently', () => {
    expect(dateFieldIso('2024-05-01')).toBe(
      new Date('2024-05-01').toISOString(),
    );
    expect(dateFieldIso(undefined)).toBeNull();
    // Unparsable degrades silently; the authoritative warnings live in
    // siteScanPages (deduped by the store's sink).
    expect(dateFieldIso('not-a-date')).toBeNull();
  });
});

describe('siteScanContext', () => {
  it('exposes pages with git times and config, null updatedAt when absent', async () => {
    const { config, abs } = await scanFixture({
      'index.md': '# Home\n',
      'a.md': '---\ndate: 2024-05-01\ncategory: Rust\n---\n# A\n',
    });
    const scan = await scanSite(config);
    const gitTimes = new Map([[abs('a.md'), '2026-01-02T03:04:05.000Z']]);
    const ctx = siteScanContext(config, scan, gitTimes);

    expect(ctx.config).toBe(config);
    const a = ctx.pages.find(p => p.relPath === 'a.md')!;
    expect(a.route).toBe('/a');
    expect(a.locale.key).toBe('root');
    expect(a.createdAt).toBe(new Date('2024-05-01').toISOString());
    expect(a.updatedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(a.frontmatter.category).toEqual(['Rust']);

    const home = ctx.pages.find(p => p.relPath === 'index.md')!;
    expect(home.updatedAt).toBeNull();
    expect(home.createdAt).toBeNull();
  });

  it('warns about an unparsable date through the warn sink, once per file', async () => {
    const { config } = await scanFixture({
      'a.md': '---\ndate: not-a-date\n---\n# A\n',
      'b.md': '# B\n',
    });
    const scan = await scanSite(config);
    const warns: string[] = [];
    siteScanContext(config, scan, new Map(), msg => warns.push(msg));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('not-a-date');
    expect(warns[0]).toContain('a.md');
  });

  it('frontmatter updated overrides the git time; unparsable updated warns and falls back', async () => {
    const { config, abs } = await scanFixture({
      'a.md': '---\ndate: 2024-05-01\nupdated: 2024-06-01\n---\n# A\n',
      'b.md': '---\nupdated: bogus\n---\n# B\n',
      'c.md': '# C\n',
    });
    const scan = await scanSite(config);
    const gitTimes = new Map([
      [abs('a.md'), '2026-01-02T03:04:05.000Z'],
      [abs('b.md'), '2026-01-03T03:04:05.000Z'],
    ]);
    const warns: string[] = [];
    const ctx = siteScanContext(config, scan, gitTimes, msg => warns.push(msg));

    const a = ctx.pages.find(p => p.relPath === 'a.md')!;
    expect(a.updatedAt).toBe(new Date('2024-06-01').toISOString());

    // An unparsable updated keeps the git time instead of nulling it.
    const b = ctx.pages.find(p => p.relPath === 'b.md')!;
    expect(b.updatedAt).toBe('2026-01-03T03:04:05.000Z');
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('bogus');
    expect(warns[0]).toContain('b.md');

    const c = ctx.pages.find(p => p.relPath === 'c.md')!;
    expect(c.updatedAt).toBeNull();
  });
});

/** Minimal addPage input with an overridable source. */
const genInput = (route: string, source = '# Gen\n'): VirtualPageInput => ({
  route,
  source,
});

describe('virtualPageEntry', () => {
  it('synthesizes a leaf page indistinguishable from a scanned file', async () => {
    const { config, abs } = await scanFixture({ 'index.md': '# Home\n' });
    const { source, file } = virtualPageEntry(
      config,
      genInput('/friends', '---\ntitle: Friends\n---\n```rust\nlet x;\n```\n'),
      new Set(['/']),
    );
    expect(source.filePath).toBe(abs('friends.md'));
    expect(source.relPath).toBe('friends.md');
    expect(source.route).toBe('/friends');
    expect(source.locale.key).toBe('root');
    // `title` is not a framework key (the page title comes from the first
    // h1): it rides rawFrontmatter like any custom key.
    expect(file.rawFrontmatter.title).toBe('Friends');
    expect(file.fenceLangs).toEqual(['rust']);
    // The mtime is a source hash: stable per content, different across it.
    const again = virtualPageEntry(
      config,
      genInput('/friends', '---\ntitle: Friends\n---\n```rust\nlet x;\n```\n'),
      new Set(['/']),
    );
    expect(again.file.mtimeMs).toBe(file.mtimeMs);
    const changed = virtualPageEntry(
      config,
      genInput('/friends'),
      new Set(['/']),
    );
    expect(changed.file.mtimeMs).not.toBe(file.mtimeMs);
  });

  it('maps a trailing-slash route to the directory index page (slash mode)', async () => {
    const { config, abs } = await scanFixture({ 'index.md': '# Home\n' });
    const { source } = virtualPageEntry(
      config,
      genInput('/friends/'),
      new Set(),
    );
    expect(source.relPath).toBe('friends/index.md');
    expect(source.route).toBe('/friends/');
    expect(source.filePath).toBe(abs('friends/index.md'));
  });

  it('applies the locale prefix and validates the locale key', async () => {
    const { config } = await scanFixture(
      { 'index.md': '# Home\n', 'en/index.md': '# En home\n' },
      { locales: { en: { lang: 'en', label: 'English' } } },
    );
    const { source, file } = virtualPageEntry(
      config,
      { route: '/friends', locale: 'en', source: '# En\n' },
      new Set(),
    );
    expect(source.route).toBe('/en/friends');
    expect(source.relPath).toBe('friends.md');
    expect(file.frontmatter).toEqual({});
    expect(() =>
      virtualPageEntry(
        config,
        { route: '/friends', locale: 'fr', source: '' },
        new Set(),
      ),
    ).toThrowError(/unknown locale 'fr' \(configured: root, en\)/);
  });

  it('keeps encoded canonical routes and accepts plain decoded input', async () => {
    const { config } = await scanFixture({ 'index.md': '# Home\n' });
    const { source } = virtualPageEntry(config, genInput('/标签'), new Set());
    expect(source.relPath).toBe('标签.md');
    expect(source.route).toBe('/%E6%A0%87%E7%AD%BE');
  });

  it('rejects route collisions, the home route, and non-canonical shapes', async () => {
    const { config } = await scanFixture(
      { 'index.md': '# Home\n', 'a.md': '# A\n' },
      { urls: { directoryIndex: 'bare' } },
    );
    expect(() =>
      virtualPageEntry(config, genInput('/a'), new Set(['/a'])),
    ).toThrowError(/route \/a already exists/);
    expect(() =>
      virtualPageEntry(config, genInput('/'), new Set()),
    ).toThrowError(/'\/' is the site home/);
    // Bare mode canonicalizes directory indexes without the slash.
    expect(() =>
      virtualPageEntry(config, genInput('/friends/'), new Set()),
    ).toThrowError(
      /not canonical for directoryIndex 'bare' \(expected '\/friends'\)/,
    );
    expect(() =>
      virtualPageEntry(config, genInput('friends'), new Set()),
    ).toThrowError(/must be a locale-relative clean route starting with '\/'/);
  });

  it('collects addPage entries through the hook context', async () => {
    const { config } = await scanFixture({ 'index.md': '# Home\n' });
    const scan = await scanSite(config);
    const virtual: VirtualPageInput[] = [];
    const ctx = siteScanContext(config, scan, new Map(), undefined, virtual);
    ctx.addPage(genInput('/a'));
    ctx.addPage(genInput('/b'));
    expect(virtual.map(v => v.route)).toEqual(['/a', '/b']);
  });
});
