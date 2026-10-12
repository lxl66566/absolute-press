import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { resolveConfig } from '../../config.ts';
import { localeContentRoot, scanRefEntry } from '../refs.ts';
import {
  REF_SEQ_RESERVE,
  runRenderShards,
  shardTasks,
  workerCount,
  type RenderShard,
  type RenderTask,
} from '../render-pool.ts';
import { scanSite } from '../scan.ts';

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(
    tmpDirs.map(dir => rm(dir, { recursive: true, force: true })),
  );
});

function task(filePath: string, source: string, mtimeMs = 1): RenderTask {
  return { filePath, source, mtimeMs };
}

describe('shardTasks', () => {
  it('spreads the longest sources across distinct shards first', () => {
    const tasks = [
      task('a', 'x'.repeat(10)),
      task('b', 'x'.repeat(40)),
      task('c', 'x'.repeat(30)),
      task('d', 'x'.repeat(20)),
    ];
    const shards = shardTasks(tasks, 2);
    // Longest-first round-robin: b/c open the shards, d/a balance them.
    expect(shards[0]!.map(t => t.filePath)).toEqual(['b', 'd']);
    expect(shards[1]!.map(t => t.filePath)).toEqual(['c', 'a']);
    expect(shards.flat().length).toBe(tasks.length);
  });

  it('keeps all tasks on one shard when shards equals one', () => {
    const shards = shardTasks([task('a', 'aa'), task('b', 'b')], 1);
    expect(shards).toHaveLength(1);
    expect(shards[0]!.length).toBe(2);
  });
});

describe('workerCount', () => {
  it('scales with tasks but never exceeds the per-worker floor or process cap', () => {
    expect(workerCount(24)).toBe(1);
    expect(workerCount(192)).toBe(8);
    expect(workerCount(10_000)).toBe(Math.min(8, os.availableParallelism()));
  });
});

/** Minimal 1x1 PNG (header fields only; the size reader needs no CRCs). */
function png1x1(): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(1, 16);
  buf.writeUInt32BE(1, 20);
  buf.writeUInt8(8, 24);
  buf.writeUInt8(6, 25);
  return buf;
}

/**
 * Real-worker round trip over a content fixture: entries, dead links, copied
 * images and term refs must all survive the structured-clone boundary with
 * the same shapes the serial pipeline produces.
 */
describe('runRenderShards', () => {
  it('renders pages and refs, returning entries and side effects', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ap-pool-'));
    tmpDirs.push(root);
    const content = path.join(root, 'content');
    await mkdir(path.join(content, 'reference', 'term'), { recursive: true });
    await writeFile(path.join(content, 'img.png'), png1x1());
    await writeFile(
      path.join(content, 'index.md'),
      '# Home\n\n[go](./a.md) and [missing](./gone.md)\n\n[[term/x]] refs.\n',
    );
    await writeFile(
      path.join(content, 'a.md'),
      '# A\n\n```ts\nconst x: number = 1;\n```\n',
    );
    await writeFile(path.join(content, 'b.md'), '# B\n\n![img](./img.png)\n');
    await writeFile(
      path.join(content, 'reference', 'term', 'x.md'),
      '---\ntitle: Term X\n---\n\n## Section\n\nRef body with [[term/y]] unknown.\n',
    );
    await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        writeFile(path.join(content, `p${i}.md`), `# P${i}\n\nfiller\n`),
      ),
    );

    const config = resolveConfig(
      {
        contentDir: content,
        refs: ['reference'],
        title: 't',
        description: 'd',
        hostname: 'https://x',
      },
      root,
    );
    const scan = await scanSite(config);
    const defaultKey = config.locales[0]!.key;
    const ref = scanRefEntry(config, defaultKey, 'term/x');
    expect(ref).not.toBeNull();

    const tasks: RenderTask[] = scan.sources.map(p => {
      const file = scan.files.get(p.filePath)!;
      return {
        filePath: p.filePath,
        source: file.source,
        mtimeMs: file.mtimeMs,
        lang: p.locale.lang,
      };
    });
    const common = {
      pages: scan.sources,
      refRoots: [
        {
          filePath: ref!.filePath,
          root: localeContentRoot(config, ref!.locale),
        },
      ],
      refs: new Map([[defaultKey, new Map([['term/x', ref!]])]]),
      refsPresent: true,
      locales: config.locales,
      contentDir: config.contentDir,
      code: config.code,
      islands: [],
      shikiLangs: ['ts'],
    };
    const shards: RenderShard[] = shardTasks(tasks, 2).map((t, index) => ({
      ...common,
      index,
      tasks: t,
    }));

    const results = await runRenderShards(shards);
    const entries = results.flatMap(r => r.entries);
    expect(entries.length).toBe(scan.sources.length);

    const home = entries.find(e => e.filePath.endsWith('index.md'))!;
    expect(home.result.title).toBe('Home');
    // Page-relative clean link, as the serial resolver emits it.
    expect(home.result.html).toContain('href="a"');
    expect(home.result.html).toContain('data-term="term/x"');

    const dead = results.flatMap(r => r.deadLinks);
    expect(dead).toContainEqual({
      file: path.join(content, 'index.md'),
      raw: './gone.md',
    });

    // Image copied by the worker: same hashed file name the serial path emits.
    const images = results.flatMap(r => r.images);
    expect(images).toHaveLength(1);
    expect(images[0]![0]).toMatch(/^assets\/img\/img\.[0-9a-f]{8}\.png$/);
    expect(Buffer.from(images[0]![1])).toEqual(png1x1());

    const refHtml = results.flatMap(r => r.refHtml);
    expect(refHtml).toHaveLength(1);
    expect(refHtml[0]!.key).toBe(`${defaultKey}/term/x`);
    expect(refHtml[0]!.html).toContain('Ref body');
    // Worker-seeded ids: the reserved range keeps prefixes off the serial
    // renderer's low numbers.
    expect(refHtml[0]!.html).toContain(`ap-term-${REF_SEQ_RESERVE + 1}-`);

    const warns = results.flatMap(r => r.warns);
    expect(warns.some(([key]) => key === 'term:term/y')).toBe(true);
  });

  it('rejects when a render throws, surfacing the message', async () => {
    // Invalid island JSON prop is a deterministic render-time throw.
    const bad: RenderShard = {
      index: 0,
      tasks: [task('a.md', '<ZoomedImg :x="{bad">\n\nbody\n')],
      pages: [],
      refRoots: [],
      refs: new Map(),
      refsPresent: false,
      locales: [],
      contentDir: 'C:/unused',
      code: {
        lineNumbers: true,
        collapsedLines: null,
        wrap: false,
        copyLabel: 'copy',
      },
      islands: [{ name: 'ZoomedImg' }],
      shikiLangs: [],
    };
    await expect(runRenderShards([bad])).rejects.toThrow(/invalid JSON/);
  });
});
