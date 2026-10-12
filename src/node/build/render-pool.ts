/**
 * Worker-pool page rendering for full builds. The whole markdown pipeline
 * (markdown-it + shiki, ~95% of the framework's own build time) is CPU-bound
 * and page-parallel; shards run in worker_threads and return entries plus the
 * side effects the main thread owns (copied images, dead-link records,
 * one-shot warnings, ref popover html).
 *
 * Dev never uses the pool: single-page renders must stay on the main-thread
 * renderer. Small builds skip it too — worker startup plus renderer/shiki
 * warm-up per process costs more than a handful of serial renders.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { LocaleInfo, RenderResult } from '../../shared/types.ts';
import type { ResolvedCodeOptions } from '../markdown/options.ts';
import type { DeadLink } from './assets.ts';
import type { PageSource } from './pages.ts';
import type { ScannedRef } from './refs.ts';

/** One page render job for a worker shard. */
export interface RenderTask {
  filePath: string;
  source: string;
  mtimeMs: number;
  /** `<html lang>` of the page's locale. */
  lang?: string;
}

/** Worker-facing render input: everything needed to rebuild the pipeline. */
export interface RenderShard {
  /** Shard index; seeds the worker's disjoint refSeq range. */
  index: number;
  tasks: RenderTask[];
  /** Page inventory for link resolution (same list the main thread holds). */
  pages: PageSource[];
  /** Ref-file -> locale content root pairs (LinkResolver.setRefs input). */
  refRoots: { filePath: string; root: string }[];
  /** Refs scan per locale; empty map when the site configures no refs. */
  refs: Map<string, Map<string, ScannedRef>>;
  /** True when at least one refs directory exists (onMiss silencing). */
  refsPresent: boolean;
  locales: LocaleInfo[];
  contentDir: string;
  code: ResolvedCodeOptions;
  islands: { name: string; entryList?: boolean }[];
  shikiLangs: string[];
}

/** One worker's combined output. */
export interface ShardResult {
  /** Cache entries by file path (RenderedEntry minus the interface privacy). */
  entries: {
    filePath: string;
    mtimeMs: number;
    result: RenderResult;
    excerpt: string;
  }[];
  /** Ref popover renders keyed `<locale>/<id>`. */
  refHtml: { key: string; mtimeMs: number; html: string }[];
  deadLinks: DeadLink[];
  /** Copied images by emitted file name (bytes survive structured clone). */
  images: [string, Uint8Array][];
  /** One-shot warnings (key + message) for the main thread to dedupe. */
  warns: [string, string][];
}

/** Message a worker posts back. */
export type ShardMessage =
  | { type: 'done'; result: ShardResult }
  | { type: 'error'; message: string };

/**
 * Below this many stale pages the pool loses to the serial path. Measured
 * (16 logical cores): a worker pays ~0.5s warm-up (module graph, shiki init,
 * first-render JIT) and cold-JIT pages render 3-6x slower than the warmed
 * main thread, so small sites break even only when each worker gets enough
 * pages to amortize the JIT. 500 pages: no gain; 3000 pages: 2.2x.
 */
export const POOL_MIN_TASKS = 1024;
/** Fewer pages per worker than this wastes the per-process warm-up. */
const MIN_TASKS_PER_WORKER = 24;
/** Absolute cap: beyond 8 processes the copy/merge overhead dominates. */
const MAX_WORKERS = 8;
/**
 * refSeq range reserved per worker (renderRef seeds popover-unique ids from
 * `refSeq * 1e6`). Worker i starts at `(i+1) * REF_SEQ_RESERVE`, far above
 * any single-process count and with seed products still inside 2^53.
 */
export const REF_SEQ_RESERVE = 100_000;

export function workerCount(tasks: number): number {
  return Math.max(
    1,
    Math.min(
      Math.ceil(tasks / MIN_TASKS_PER_WORKER),
      os.availableParallelism(),
      MAX_WORKERS,
    ),
  );
}

/**
 * Longest-source-first round-robin: the biggest pages land on distinct
 * workers first, so shards finish together instead of one trailing giant.
 */
export function shardTasks(
  tasks: RenderTask[],
  shards: number,
): RenderTask[][] {
  const out: RenderTask[][] = Array.from({ length: shards }, () => []);
  const ordered = tasks.toSorted((a, b) => b.source.length - a.source.length);
  ordered.forEach((task, i) => out[i % shards]!.push(task));
  return out;
}

/** Worker entry file; the .vite-temp config bundle breaks import.meta-relative
 * resolution, so the project layout is the fallback (clientEntry pattern). */
function workerEntry(): string {
  const candidates = [
    fileURLToPath(new URL('./render-worker.ts', import.meta.url)),
    path.resolve(process.cwd(), 'src/node/build/render-worker.ts'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    '[absolute-press] cannot locate src/node/build/render-worker.ts',
  );
}

/**
 * Run shards in parallel workers. Each worker gets one message and posts one
 * result; any failure (load or render) rejects, and every worker is
 * terminated either way. Partial results are discarded — the caller falls
 * back to serial rendering, which re-produces them deterministically.
 */
export async function runRenderShards(
  shards: RenderShard[],
): Promise<ShardResult[]> {
  const workers: Worker[] = [];
  const terminateAll = (): void => {
    for (const w of workers) void w.terminate();
  };
  try {
    const results = await Promise.all(
      shards.map(
        (shard, i) =>
          new Promise<ShardResult>((resolve, reject) => {
            const w = new Worker(pathToFileURL(workerEntry()), {
              name: `absolute-press-render-${i}`,
            });
            workers.push(w);
            w.on('message', (msg: ShardMessage) => {
              if (msg.type === 'done') resolve(msg.result);
              else reject(new Error(msg.message));
            });
            w.on('error', reject);
            w.on('exit', code => {
              if (code !== 0)
                reject(new Error(`render worker exited with code ${code}`));
            });
            // eslint-disable-next-line unicorn/require-post-message-target-origin -- worker port, not window (no targetOrigin)
            w.postMessage(shard);
          }),
      ),
    );
    return results;
  } finally {
    terminateAll();
  }
}
