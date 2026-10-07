import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ~100 paths per call keeps argv far below the Windows CreateProcess ~32K limit.
const BATCH_SIZE = 100;

// Each `git log` walks the full history, so unbounded Promise.all turned N
// batches into N concurrent full-history walks; a small fixed pool keeps
// CPU/IO pressure sane for large sites.
const MAX_CONCURRENT_BATCHES = 4;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Promise.all with a concurrency cap: a fixed worker pool over the input
 * list, preserving input order in the result. Rejection propagates (like
 * Promise.all) — callers that want per-item isolation catch inside `fn`.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  // Pre-sized: every index is filled before Promise.all resolves.
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      // Unreachable (loop condition); satisfies noUncheckedIndexedAccess.
      if (item === undefined) break;
      // The sequential await per worker IS the concurrency cap; hoisting it
      // into a Promise.all would restore the unbounded fan-out.
      // oxlint-disable-next-line no-await-in-loop
      out[index] = await fn(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

/**
 * Parse one `git log --format=\x01%cI --name-only` batch output into
 * absolute file path -> ISO time.
 */
function parseLogBatch(stdout: string, repoRoot: string): Map<string, string> {
  // \x01 marks commit lines; file lines follow until the next commit line.
  // git log is newest-first, so the first occurrence of a file wins.
  const batch = new Map<string, string>();
  let current: string | null = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('\x01')) {
      current = line.slice(1).trim();
    } else if (line.trim() && current) {
      const abs = path.resolve(repoRoot, line.trim());
      if (!batch.has(abs)) batch.set(abs, current);
    }
  }
  return batch;
}

/**
 * Batch last-commit times for many files via chunked `git log` calls with a
 * bounded concurrency. Returns absolute file path -> ISO time. Repo-level
 * failures (not a git repo / git missing) return an empty map; a single
 * batch failure only drops that batch's files (console.warn) and keeps the
 * rest — callers fall back to null per missing file.
 */
export async function getGitTimes(
  files: string[],
  cwd: string,
): Promise<Map<string, string>> {
  const times = new Map<string, string>();
  if (files.length === 0) return times;
  let repoRoot: string;
  try {
    repoRoot = (
      await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        timeout: 10_000,
      })
    ).stdout.trim();
  } catch {
    // Not a git repo / git missing: no times at all, silently.
    return times;
  }
  const rel = files.map(f =>
    path.relative(repoRoot, f).split(path.sep).join('/'),
  );
  const batches = await mapWithLimit(
    chunk(rel, BATCH_SIZE),
    MAX_CONCURRENT_BATCHES,
    async batch => {
      try {
        // core.quotepath=off must precede `log`: it emits raw non-ASCII paths
        // instead of quoted C-escaped forms (default quotepath would make
        // Chinese filenames unmatchable against page.filePath).
        const { stdout } = await execFileAsync(
          'git',
          [
            '-c',
            'core.quotepath=off',
            'log',
            '--format=\x01%cI',
            '--name-only',
            '--no-renames',
            '--',
            ...batch,
          ],
          { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, timeout: 30_000 },
        );
        return parseLogBatch(stdout, repoRoot);
      } catch (e) {
        // One bad batch (timeout, odd pathspec...) must not wipe the whole
        // site's updatedAt values: drop only its files and warn.
        console.warn(
          `[absolute-press] git time lookup failed for a batch of ${batch.length} file(s); their updatedAt falls back to null:`,
          e instanceof Error ? e.message : String(e),
        );
        return null;
      }
    },
  );
  // Batches are disjoint, so absent-only writes merge them safely.
  for (const batch of batches) {
    if (!batch) continue;
    for (const [abs, time] of batch) {
      if (!times.has(abs)) times.set(abs, time);
    }
  }
  return times;
}
