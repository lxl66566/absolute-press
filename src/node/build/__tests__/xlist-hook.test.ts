import { describe, expect, it, vi } from 'vitest';

import type { LocaleInfo, MarkdownEnv } from '../../../shared/types.ts';
import type { PageSource } from '../pages.ts';
import { createEntryBodiesHook } from '../xlist-hook.ts';

const LOCALE: LocaleInfo = { key: '', lang: 'zh-CN', label: 'zh', prefix: '' };

function pageOf(filePath: string, route: string): PageSource {
  return { filePath, locale: LOCALE, relPath: route, route };
}

const ENV = { filePath: '/content/guide/a.md' };
const PAGE = pageOf('/content/guide/a.md', '/guide/a');

describe('createEntryBodiesHook', () => {
  it('keeps bodies below the threshold inline', () => {
    const hook = createEntryBodiesHook({
      thresholdBytes: 16,
      pageForFile: () => PAGE,
    });
    expect(hook(['<p>short</p>'], ENV)).toBeNull();
  });

  it('externalizes bodies at or past the threshold', () => {
    const hook = createEntryBodiesHook({
      thresholdBytes: 16,
      pageForFile: () => PAGE,
    });
    const out = hook(['<p> definitely past it</p>'], ENV);
    expect(out).not.toBeNull();
    // src = page base prefix + content-hashed asset file name.
    expect(out!.src).toMatch(/^\.\.\/assets\/xlist-[0-9a-f]{8}\.js$/);
  });

  it('counts UTF-8 bytes, not code units, against the threshold', () => {
    const hook = createEntryBodiesHook({
      thresholdBytes: 16,
      pageForFile: () => PAGE,
    });
    // 11 code units but 35 UTF-8 bytes: only the byte count crosses 16.
    expect(hook(['<p>汉字汉字汉字汉字</p>'], ENV)).not.toBeNull();
  });

  it('keeps bodies inline when the rendering file has no page', () => {
    const hook = createEntryBodiesHook({
      thresholdBytes: 1,
      pageForFile: () => undefined,
    });
    expect(hook(['<p>big body</p>'], ENV)).toBeNull();
  });

  it('reports katex markup that left the page html', () => {
    const hook = createEntryBodiesHook({
      thresholdBytes: 1,
      pageForFile: () => PAGE,
    });
    expect(hook(['<span class="katex">x</span>'], ENV)!.katex).toBe(true);
    expect(hook(['<p>plain</p>'], ENV)!.katex).toBe(false);
  });

  it('calls collect with the asset and the render env', () => {
    const collect =
      vi.fn<
        (asset: { fileName: string; source: string }, env: MarkdownEnv) => void
      >();
    const hook = createEntryBodiesHook({
      thresholdBytes: 1,
      pageForFile: () => PAGE,
      collect,
    });
    const out = hook(['<p>body</p>'], ENV);
    expect(collect).toHaveBeenCalledTimes(1);
    const [asset, env] = collect.mock.calls[0]!;
    expect(asset.source).toBe(
      `export default ${JSON.stringify(['<p>body</p>'])};\n`,
    );
    expect(asset.fileName.endsWith('.js')).toBe(true);
    expect(env).toBe(ENV);
    // The returned src references exactly the collected module.
    expect(out!.src.endsWith(asset.fileName)).toBe(true);
  });

  it('never externalizes when the threshold is false', () => {
    const collect =
      vi.fn<
        (asset: { fileName: string; source: string }, env: MarkdownEnv) => void
      >();
    const hook = createEntryBodiesHook({
      thresholdBytes: false,
      pageForFile: () => PAGE,
      collect,
    });
    expect(hook(['<p>any body</p>'], ENV)).toBeNull();
    expect(collect).not.toHaveBeenCalled();
  });

  it('leaves off the collect callback when not provided', () => {
    const hook = createEntryBodiesHook({
      thresholdBytes: 1,
      pageForFile: () => PAGE,
    });
    expect(hook(['<p>body</p>'], ENV)).not.toBeNull();
  });
});
