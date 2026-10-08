import fs from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveConfig } from '../../config.ts';
import type { ResolvedConfig } from '../../config.ts';
import { createdAtOf, scanFile, scanSite, siteScanContext } from '../scan.ts';

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
  );
});

/** Content fixture on disk, resolved through a site config. */
async function scanFixture(
  files: Record<string, string>,
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
    const readSpy = vi.spyOn(fs, 'readFileSync');
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

describe('createdAtOf', () => {
  it('maps a date to ISO and absent/unparsable to null', () => {
    expect(createdAtOf({ date: '2024-05-01' })).toBe(
      new Date('2024-05-01').toISOString(),
    );
    expect(createdAtOf({})).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(createdAtOf({ date: 'not-a-date' }, 'a.md')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      // Silent on internal re-derivations (no filePath).
      expect(createdAtOf({ date: 'not-a-date' })).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
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
});
