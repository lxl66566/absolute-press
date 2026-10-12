import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { resolveConfig } from '../../config.ts';
import {
  runRenderShards,
  type RenderShard,
  type ShardResult,
} from '../render-pool.ts';
import { SiteStore } from '../site.ts';

// The pool's worker round trip has its own suite (render-pool.test.ts); this
// file covers SiteStore's wiring: shard construction, result merging and the
// serial fallback. The real pool is mocked so a two-page fixture can drive
// the build-only path below the production page threshold.
vi.mock('../render-pool.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('../render-pool.ts')>();
  return {
    ...actual,
    // Small enough that any stale page count trips the pool path.
    POOL_MIN_TASKS: 1,
    runRenderShards: vi.fn<(shards: RenderShard[]) => Promise<ShardResult[]>>(),
  };
});

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(
    tmpDirs.map(dir => rm(dir, { recursive: true, force: true })),
  );
});

async function twoPageFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ap-poolwire-'));
  tmpDirs.push(root);
  await mkdir(path.join(root, 'content'), { recursive: true });
  await writeFile(path.join(root, 'content', 'index.md'), '# Home\n');
  await writeFile(path.join(root, 'content', 'a.md'), '# A\n');
  return root;
}

function stubShardResult(shard: RenderShard): ShardResult {
  return {
    entries: shard.tasks.map(t => ({
      filePath: t.filePath,
      mtimeMs: t.mtimeMs,
      result: {
        html: `<h1>pooled ${path.basename(t.filePath)}</h1>`,
        title: `pooled ${path.basename(t.filePath)}`,
        headings: [],
        frontmatter: {},
        links: [],
        readingTime: 1,
      },
      excerpt: 'pooled excerpt',
    })),
    refHtml: [],
    deadLinks: [{ file: 'x.md', raw: './y.md' }],
    images: [['assets/img/p.12345678.png', new Uint8Array([1, 2, 3])]],
    warns: [['warn-key', '[absolute-press] pooled warn message']],
  };
}

describe('SiteStore parallel rendering wiring', () => {
  it('fans stale pages out and merges pool results into the caches', async () => {
    const root = await twoPageFixture();
    const config = resolveConfig(
      {
        contentDir: path.join(root, 'content'),
        title: 't',
        description: 'd',
        hostname: 'https://x',
      },
      root,
    );
    const run = vi
      .mocked(runRenderShards)
      .mockImplementation(async shards => shards.map(stubShardResult));

    const store = new SiteStore(config);
    await store.sync('build');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const files = await store.emitAll({
        isBuild: true,
        scriptFile: 'assets/entry.js',
        cssFiles: [],
      });
      // Every page went through the mocked pool exactly once.
      expect(run).toHaveBeenCalledTimes(1);
      const shards = run.mock.calls[0]![0];
      expect(shards.length).toBeGreaterThanOrEqual(1);
      expect(shards.flatMap(s => s.tasks.map(t => t.filePath)).length).toBe(2);
      // Shard inputs carry the page inventory and renderer options.
      expect(shards[0]!.pages.length).toBe(2);
      expect(shards[0]!.shikiLangs).toEqual([...store['rendererLangs']]);

      // Pooled entries feed the emitted html and excerpts.
      const home = String(
        files.find(f => f.fileName === 'index.html')?.source ?? '',
      );
      expect(home).toContain('pooled index.md');
      // Side effects merged: copied image emitted, dead link reported.
      expect(files.some(f => f.fileName === 'assets/img/p.12345678.png')).toBe(
        true,
      );
      expect(store.deadLinks()).toContainEqual({
        file: 'x.md',
        raw: './y.md',
      });
      // One-shot warns replayed through warnOnce.
      expect(warn).toHaveBeenCalledWith('[absolute-press] pooled warn message');

      // Warm emit: no second pool round.
      await store.emitAll({
        isBuild: true,
        scriptFile: 'assets/entry.js',
        cssFiles: [],
      });
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('falls back to serial rendering when the pool fails', async () => {
    const root = await twoPageFixture();
    const config = resolveConfig(
      {
        contentDir: path.join(root, 'content'),
        title: 't',
        description: 'd',
        hostname: 'https://x',
      },
      root,
    );
    vi.mocked(runRenderShards).mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const store = new SiteStore(config);
      await store.sync('build');
      const files = await store.emitAll({
        isBuild: true,
        scriptFile: 'assets/entry.js',
        cssFiles: [],
      });
      // The real renderer produced the pages; only a fallback notice fired.
      const home = String(
        files.find(f => f.fileName === 'index.html')?.source ?? '',
      );
      expect(home).toContain('>Home</h1>');
      expect(home).not.toContain('pooled');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toMatch(/parallel rendering failed/);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps the production threshold above small-fixture sizes', async () => {
    // Other suites' fixtures are tiny; if the real threshold ever drops to
    // their page counts they would start real worker processes. Read the
    // source (the module itself is mocked in this file).
    const source = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../render-pool.ts', import.meta.url), 'utf8'),
    );
    const threshold = /POOL_MIN_TASKS = (\d+)/.exec(source)?.[1];
    expect(Number(threshold)).toBeGreaterThan(16);
  });
});
