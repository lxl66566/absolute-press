import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveConfig } from '../../config.ts';
import type { AbsolutePressConfig, ResolvedConfig } from '../../config.ts';
import { scanPages } from '../pages.ts';
import {
  isRefFile,
  localeKeyOf,
  lookupRef,
  refTitle,
  scanRefEntry,
  scanRefs,
} from '../refs.ts';

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
  );
});

/** Site fixture on disk; `refs` names the term-library root(s). */
async function fixture(
  files: Record<string, string>,
  refs: string | string[] | null = 'reference',
  extra: Partial<AbsolutePressConfig> = {},
): Promise<ResolvedConfig> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ap-refs-'));
  tmpDirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([rel, body]) => {
      await mkdir(path.dirname(path.join(root, 'content', rel)), {
        recursive: true,
      });
      await writeFile(path.join(root, 'content', rel), body);
    }),
  );
  return resolveConfig(
    {
      contentDir: 'content',
      title: 'Site',
      description: 'desc',
      hostname: 'https://test.example.com',
      ...(refs ? { refs } : {}),
      ...extra,
    },
    root,
  );
}

describe('scanRefs', () => {
  const EN: Partial<AbsolutePressConfig> = {
    locales: { en: { lang: 'en', label: 'English' } },
  };

  it('indexes refs by locale with ids derived from the relative path', async () => {
    const config = await fixture(
      {
        'index.md': '# Home\n',
        'reference/island.md': '---\ntitle: 岛屿\n---\nbody\n',
        'reference/architecture/mpa.md':
          'plain body\n```rust\nfn f() {}\n```\n',
        'en/guide/a.md': '# A\n',
        'en/reference/en-only.md': 'en ref\n',
      },
      'reference',
      EN,
    );
    const scan = await scanRefs(config);
    expect(scan.present).toBe(true);
    const zh = scan.byLocale.get('root')!;
    expect([...zh.keys()]).toEqual(['architecture/mpa', 'island']);
    expect(zh.get('island')!.title).toBe('岛屿');
    expect(zh.get('architecture/mpa')!.fenceLangs).toEqual(['rust']);
    const en = scan.byLocale.get('en')!;
    expect([...en.keys()]).toEqual(['en-only']);
  });

  it('falls back to the default locale on lookup misses', async () => {
    const config = await fixture(
      {
        'reference/shared.md': 'body\n',
        'en/reference/en-only.md': 'body\n',
      },
      'reference',
      EN,
    );
    const scan = await scanRefs(config);
    expect(lookupRef(scan, 'shared', 'root', config)!.id).toBe('shared');
    expect(lookupRef(scan, 'shared', 'en', config)!.locale).toBe('root');
    expect(lookupRef(scan, 'en-only', 'en', config)!.locale).toBe('en');
    expect(lookupRef(scan, 'en-only', 'root', config)).toBeNull();
  });

  it('reports a missing directory without failing (nested-repo scenario)', async () => {
    const config = await fixture({ 'index.md': '# Home\n' });
    const scan = await scanRefs(config);
    expect(scan.present).toBe(false);
    expect(scan.byLocale.size).toBe(0);
  });

  it('derives the display title from the id when frontmatter has none', () => {
    expect(refTitle({ title: null, id: 'a/b/last' } as never)).toBe('last');
  });

  it('re-reads a single entry for the dev watcher path', async () => {
    const config = await fixture({
      'reference/x.md': '---\ntitle: Old\n---\n',
      'reference/y.md': 'gone\n',
    });
    const scan = await scanRefs(config);
    const fresh = scanRefEntry(config, 'root', 'x');
    expect(fresh!.title).toBe('Old');
    expect(scanRefEntry(config, 'root', 'missing')).toBeNull();
    expect(scan.byLocale.get('root')!.size).toBe(2);
  });

  it('collects multiple roots in config order', async () => {
    const config = await fixture(
      {
        'index.md': '# Home\n',
        'reference/a.md': '---\ntitle: A\n---\n',
        'glossary/b.md': 'g\n',
        'glossary/nested/c.md': 'g\n',
      },
      ['reference', 'glossary'],
    );
    const scan = await scanRefs(config);
    expect([...scan.byLocale.get('root')!.keys()].toSorted()).toEqual([
      'a',
      'b',
      'nested/c',
    ]);
    // One missing root among several keeps the scan present.
    expect(scan.present).toBe(true);
  });

  it('rejects duplicate ids across roots', async () => {
    const config = await fixture(
      { 'reference/a.md': 'x\n', 'glossary/a.md': 'x\n' },
      ['reference', 'glossary'],
    );
    await expect(scanRefs(config)).rejects.toThrow(/duplicate ref id "a"/);
  });

  it('dedupes the same root listed twice (after normalization)', async () => {
    const config = await fixture({ 'reference/a.md': 'x\n' }, [
      'reference',
      './reference/',
    ]);
    expect(config.refs).toEqual(['reference', 'reference']);
    const scan = await scanRefs(config);
    expect([...scan.byLocale.get('root')!.keys()]).toEqual(['a']);
  });

  it('collects roots that sit outside the content tree', async () => {
    // Fixture keys join under <root>/content, so ../ escapes it.
    const config = await fixture(
      { 'index.md': '# Home\n', '../outside/x.md': 'outside\n' },
      ['../outside'],
    );
    const scan = await scanRefs(config);
    expect(scan.byLocale.get('root')!.get('x')!.source).toBe('outside\n');
    // Escaped roots are outside every page walk by construction.
    const pages = await scanPages(config);
    expect(pages.map(p => p.relPath)).toEqual(['index.md']);
  });

  it('re-reads through the roots in config order', async () => {
    const dup = await fixture(
      { 'reference/x.md': 'first\n', 'glossary/x.md': 'second\n' },
      ['reference', 'glossary'],
    );
    expect(scanRefEntry(dup, 'root', 'x')!.source).toBe('first\n');
    const second = await fixture({ 'glossary/y.md': 'second root only\n' }, [
      'reference',
      'glossary',
    ]);
    expect(scanRefEntry(second, 'root', 'y')!.source).toBe(
      'second root only\n',
    );
    expect(scanRefEntry(second, 'root', 'missing')).toBeNull();
  });

  it('rejects absolute and bare-dot roots at config time', async () => {
    await expect(fixture({ 'index.md': 'x\n' }, '/abs')).rejects.toThrow(
      /refs must be relative/,
    );
    await expect(fixture({ 'index.md': 'x\n' }, '..')).rejects.toThrow(
      /refs must be relative/,
    );
  });
});

describe('refs routing and classification', () => {
  it('excludes the refs directory from the page walk for every locale', async () => {
    const config = await fixture(
      {
        'index.md': '# Home\n',
        'reference/term.md': 'not a page\n',
        'reference/nested/deep.md': 'not a page\n',
        'en/reference/term.md': 'not a page\n',
        'en/guide/page.md': '# Page\n',
      },
      'reference',
      { locales: { en: { lang: 'en', label: 'English' } } },
    );
    const pages = await scanPages(config);
    // relPath is locale-relative; the en page counts, its refs tree does not.
    expect(pages.map(p => p.relPath).toSorted()).toEqual([
      'guide/page.md',
      'index.md',
    ]);
  });

  it('excludes every configured root from the page walk', async () => {
    const config = await fixture(
      {
        'index.md': '# Home\n',
        'reference/term.md': 'not a page\n',
        'glossary/term2.md': 'not a page\n',
      },
      ['reference', 'glossary'],
    );
    const pages = await scanPages(config);
    expect(pages.map(p => p.relPath)).toEqual(['index.md']);
  });

  it('classifies ref files by directory, not extension', async () => {
    const config = await fixture(
      {
        'reference/x.md': 'x\n',
        'en/reference/y.md': 'y\n',
        'guide/z.md': 'z\n',
      },
      'reference',
      { locales: { en: { lang: 'en', label: 'English' } } },
    );
    const abs = (rel: string): string => path.join(config.contentDir, rel);
    expect(isRefFile(config, abs('reference/x.md'))).toBe(true);
    expect(isRefFile(config, abs('en/reference/y.md'))).toBe(true);
    expect(isRefFile(config, abs('guide/z.md'))).toBe(false);
    expect(isRefFile(config, abs('reference/img.png'))).toBe(true);
  });

  it('maps files to their locale key by content prefix', async () => {
    const config = await fixture(
      { 'index.md': 'x\n', 'en/guide/a.md': 'x\n' },
      'reference',
      { locales: { en: { lang: 'en', label: 'English' } } },
    );
    expect(localeKeyOf(config, path.join(config.contentDir, 'index.md'))).toBe(
      'root',
    );
    expect(
      localeKeyOf(config, path.join(config.contentDir, 'en/guide/a.md')),
    ).toBe('en');
  });
});
