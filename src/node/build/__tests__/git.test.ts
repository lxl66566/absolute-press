import { execFile } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { getGitTimes, mapWithLimit } from '../git.ts';

const execFileAsync = promisify(execFile);

/** Fixture commit dates; %cI normalizes a +00:00 offset to Z. */
const T1 = '2024-01-01T00:00:00Z';
const T2 = '2025-06-15T12:30:00Z';
const T1_ENV = '2024-01-01T00:00:00+00:00';
const T2_ENV = '2025-06-15T12:30:00+00:00';

async function hasGit(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

const gitAvailable = await hasGit();

const tmpDirs: string[] = [];
afterAll(async () => {
  await Promise.all(
    tmpDirs.map(dir => rm(dir, { recursive: true, force: true })),
  );
});

function runGit(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd, env, timeout: 15_000 });
}

async function initRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'ap-git-test-'));
  tmpDirs.push(repo);
  // -b main avoids the default-branch-name hint polluting stderr on Windows.
  await runGit(['init', '-b', 'main'], repo);
  return repo;
}

/** Identity and dates come from per-command flags/env, never global config. */
async function commitAll(repo: string, dateEnv: string): Promise<void> {
  await runGit(['add', '-A'], repo);
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: dateEnv,
    GIT_COMMITTER_DATE: dateEnv,
  };
  await runGit(
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-n',
      '-m',
      'fixture commit',
    ],
    repo,
    env,
  );
}

describe.skipIf(!gitAvailable)('getGitTimes', () => {
  it('resolves non-ASCII filenames and dirs with the newest commit time', async () => {
    const repo = await initRepo();
    const zhFile = path.join(repo, '中文.md');
    const zhDirFile = path.join(repo, '中文目录', '文章.md');
    const asciiFile = path.join(repo, 'ascii.md');
    await writeFile(zhFile, '# one\n');
    await mkdir(path.join(repo, '中文目录'));
    await writeFile(zhDirFile, '# one\n');
    await writeFile(asciiFile, '# one\n');
    await commitAll(repo, T1_ENV);
    await appendFile(zhFile, 'two\n');
    await commitAll(repo, T2_ENV);

    const times = await getGitTimes([zhFile, zhDirFile, asciiFile], repo);
    // Without core.quotepath=off the parsed path is a quoted C-escaped string
    // and none of these lookups hit.
    expect(times.get(zhFile)).toBe(T2);
    expect(times.get(zhDirFile)).toBe(T1);
    expect(times.get(asciiFile)).toBe(T1);
  });

  it('merges batched git log calls, newest commit wins per file', async () => {
    const repo = await initRepo();
    // 250 files force multiple batches (BATCH_SIZE is 100).
    const names = Array.from(
      { length: 250 },
      (_, i) => `post-${String(i).padStart(3, '0')}.md`,
    );
    const fileOf = (name: string): string => path.join(repo, name);
    await Promise.all(
      names.map(name => writeFile(fileOf(name), `# ${name}\n`)),
    );
    await commitAll(repo, T1_ENV);
    // Touch one file in the first and one in the last batch.
    await Promise.all(
      ['post-000.md', 'post-249.md'].map(name =>
        appendFile(fileOf(name), 'two\n'),
      ),
    );
    await commitAll(repo, T2_ENV);

    const times = await getGitTimes(names.map(fileOf), repo);
    expect(times.size).toBe(names.length);
    expect(times.get(fileOf('post-000.md'))).toBe(T2);
    expect(times.get(fileOf('post-249.md'))).toBe(T2);
    expect(times.get(fileOf('post-120.md'))).toBe(T1);
  });

  it('returns an empty map outside a git repo without throwing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ap-nogit-'));
    tmpDirs.push(dir);
    const times = await getGitTimes([path.join(dir, '中文.md')], dir);
    expect(times.size).toBe(0);
  });

  it('keeps other batches when a single batch fails, warning instead of dropping all', async () => {
    const repo = await initRepo();
    // 200 valid paths + 1 outside path chunk into [100, 100, 1], so the
    // failing pathspec sits in its own batch and the healthy ones survive.
    const names = Array.from(
      { length: 200 },
      (_, i) => `post-${String(i).padStart(3, '0')}.md`,
    );
    const fileOf = (name: string): string => path.join(repo, name);
    await Promise.all(
      names.map(name => writeFile(fileOf(name), `# ${name}\n`)),
    );
    await commitAll(repo, T1_ENV);
    // A pathspec outside the repo makes exactly its batch's `git log` exit
    // 128 ("outside repository") while the other batches stay healthy.
    const outside = path.join(path.dirname(repo), 'outside.md');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const times = await getGitTimes([...names.map(fileOf), outside], repo);
      // Healthy batches keep their times; only the failed batch drops out.
      expect(times.size).toBe(names.length);
      expect(times.has(outside)).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
        'git time lookup failed',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('resolves to an empty map (with warns) when every batch fails', async () => {
    const repo = await initRepo();
    const file = path.join(repo, 'a.md');
    await writeFile(file, '# A\n');
    await commitAll(repo, T1_ENV);
    // Simulate repo corruption: rev-parse still works, every `git log`
    // exits non-zero.
    await rm(path.join(repo, '.git', 'refs', 'heads'), {
      recursive: true,
      force: true,
    });
    await rm(path.join(repo, '.git', 'packed-refs'), { force: true });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(getGitTimes([file], repo)).resolves.toEqual(new Map());
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('mapWithLimit', () => {
  it('caps in-flight work and preserves input order', async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithLimit([1, 2, 3, 4, 5, 6], 2, async n => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 10));
      inFlight--;
      return n * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
  });

  it('propagates rejection like Promise.all (callers isolate per item)', async () => {
    await expect(
      mapWithLimit([1, 2], 2, async n =>
        n === 1 ? Promise.reject(new Error('boom')) : n,
      ),
    ).rejects.toThrow('boom');
  });
});
