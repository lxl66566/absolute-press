import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { pruneStale, walkFiles } from '../incremental.ts';

const roots: string[] = [];

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'incr-'));
  roots.push(dir);
  return dir;
}

/** Write an outDir tree from posix-ish relative names. */
function seed(outDir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    const abs = join(outDir, ...name.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
}

afterEach(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  roots.length = 0;
});

describe('walkFiles', () => {
  it('lists files posix-relative, recursing through directories', () => {
    const dir = root();
    seed(dir, {
      'a.html': 'x',
      'sub/b.html': 'x',
      'sub/deep/c.js': 'x',
    });
    expect(walkFiles(dir).sort()).toEqual([
      'a.html',
      'sub/b.html',
      'sub/deep/c.js',
    ]);
  });

  it('reads a missing directory as empty', () => {
    expect(walkFiles(join(root(), 'nope'))).toEqual([]);
  });

  it('never lists .git contents', () => {
    const dir = root();
    seed(dir, { 'a.html': 'x', '.git/config': 'x' });
    expect(walkFiles(dir)).toEqual(['a.html']);
  });
});

describe('pruneStale', () => {
  it('removes files outside the keep set and prunes emptied directories', () => {
    const dir = root();
    seed(dir, {
      'index.html': 'x',
      'assets/entry-1.js': 'x',
      'assets/entry-2.js': 'x', // renamed hash: stale
      'old/deep/gone.html': 'x', // whole subtree goes stale
      'keep.txt': 'x',
    });
    const removed = pruneStale(
      dir,
      new Set(['index.html', 'assets/entry-1.js', 'keep.txt']),
    );
    expect(removed).toBe(2);
    expect(walkFiles(dir).sort()).toEqual([
      'assets/entry-1.js',
      'index.html',
      'keep.txt',
    ]);
    // The emptied parent directories are gone, not just the files.
    expect(walkFiles(dir)).not.toContain('old/deep/gone.html');
  });

  it('keeps a non-empty parent of a stale file', () => {
    const dir = root();
    seed(dir, { 'sub/a.html': 'x', 'sub/stale.js': 'x' });
    expect(pruneStale(dir, new Set(['sub/a.html']))).toBe(1);
    expect(walkFiles(dir)).toEqual(['sub/a.html']);
  });

  it('counts only files it actually removed', () => {
    const dir = root();
    seed(dir, { 'a.html': 'x' });
    // keep lists the file twice under different names; only one is stale.
    expect(pruneStale(dir, new Set(['a.html']))).toBe(0);
    seed(dir, { 'b.html': 'x' });
    expect(pruneStale(dir, new Set(['a.html']))).toBe(1);
    // Removing again finds nothing on disk; the count stays honest.
    expect(pruneStale(dir, new Set(['a.html']))).toBe(0);
  });

  it('is inert for a missing outDir', () => {
    expect(pruneStale(join(root(), 'nope'), new Set())).toBe(0);
  });

  it('reports symlinks without following or touching them', () => {
    const dir = root();
    seed(dir, { 'real/a.html': 'x' });
    // Symlink to a directory: reported as a plain entry, never recursed.
    symlinkSync(join(dir, 'real'), join(dir, 'link'), 'dir');
    expect(walkFiles(dir).sort()).toEqual(['link', 'real/a.html']);
    // Outside keep -> treated stale like any file; rmSync drops the link,
    // not the target directory.
    expect(pruneStale(dir, new Set(['real/a.html']))).toBe(1);
    expect(walkFiles(dir)).toEqual(['real/a.html']);
  });
});
