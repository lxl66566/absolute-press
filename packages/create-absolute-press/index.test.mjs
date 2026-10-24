import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { sanitizePackageName } from './sanitize-name.mjs';

/**
 * `sanitizePackageName` is unit-tested directly; the one spawn smoke test
 * runs the real bin entry end to end (template copy, name replacement).
 * Spawned directories stay short: Windows rejects copy targets beyond the
 * 260-char path limit, so overlong names are the sanitizer's unit-test
 * territory, not the filesystem's.
 */
const SCAFFOLD = fileURLToPath(new URL('./index.mjs', import.meta.url));

const root = mkdtempSync(join(tmpdir(), 'ap-create-test-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('sanitizePackageName', () => {
  it('keeps valid names unchanged', () => {
    expect(sanitizePackageName('my-blog')).toBe('my-blog');
  });

  it('sanitizes spaces, case and CJK away', () => {
    expect(sanitizePackageName('My Blog')).toBe('my-blog');
    expect(sanitizePackageName('中文目录')).toBe('my-blog');
    expect(sanitizePackageName('_lead')).toBe('lead');
  });

  it('caps the name at the npm 214-char limit', () => {
    expect(sanitizePackageName('a'.repeat(214))).toHaveLength(214);
    expect(sanitizePackageName('a'.repeat(300))).toHaveLength(214);
  });

  it('strips separators the length cut exposes', () => {
    expect(sanitizePackageName(`blog-${'a'.repeat(300)}`)).not.toMatch(
      /[-._]$/,
    );
    expect(
      sanitizePackageName(`blog-${'a'.repeat(300)}`).startsWith('blog-'),
    ).toBe(true);
  });

  it('falls back when nothing valid remains', () => {
    expect(sanitizePackageName('---')).toBe('my-blog');
    expect(sanitizePackageName('-'.repeat(300))).toBe('my-blog');
  });
});

describe('scaffolder smoke', () => {
  it('writes the sanitized name into the scaffolded package.json', () => {
    const target = join(root, 'My Blog');
    execFileSync(process.execPath, [SCAFFOLD, target], { stdio: 'ignore' });
    const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-blog');
  });
});
