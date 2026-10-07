import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { katexAssets, pageUsesKatex } from '../katex-assets.ts';

describe('pageUsesKatex', () => {
  it('detects successful inline and block math markup', () => {
    expect(pageUsesKatex('<p>a <span class="katex">x</span></p>')).toBe(true);
    expect(
      pageUsesKatex(
        '<p class="katex-block"><span class="katex-display"><span class="katex">x</span></span></p>',
      ),
    ).toBe(true);
  });

  it('detects the parse-error fallback output', () => {
    // Parse failures carry no class="katex" wrapper (single-quoted attrs),
    // so the error class must be checked separately.
    expect(pageUsesKatex("<span class='katex-error'>\\frac{1</span>")).toBe(
      true,
    );
    expect(
      pageUsesKatex("<p class='katex-block katex-error'>\\frac{1</p>"),
    ).toBe(true);
  });

  it('ignores prose and code that merely mention katex', () => {
    expect(pageUsesKatex('<p>katex renders math</p><code>katex</code>')).toBe(
      false,
    );
    expect(pageUsesKatex('<p>plain text</p>')).toBe(false);
  });

  it('stays conservative on raw html carrying the marker', () => {
    // User-authored html with the class keeps the stylesheet — the safe
    // direction for a heuristic.
    expect(pageUsesKatex('<span class="katex">plain</span>')).toBe(true);
  });
});

describe('katexAssets', () => {
  it('emits the css plus a woff2-only font set', () => {
    const files = katexAssets();
    const css = files.filter(f => f.fileName === 'assets/katex/katex.min.css');
    expect(css).toHaveLength(1);
    const fonts = files
      .map(f => f.fileName)
      .filter(name => name.startsWith('assets/katex/fonts/'));
    expect(fonts.length).toBeGreaterThan(0);
    for (const name of fonts) expect(name.endsWith('.woff2')).toBe(true);
    // Shipped fonts are exactly the woff2 files the css declares.
    const cssText = String(css[0]!.source);
    for (const name of fonts) {
      expect(cssText).toContain(path.posix.basename(name));
    }
  });

  it('skips the legacy woff/ttf files sitting next to them', () => {
    const require = createRequire(fileURLToPath(import.meta.url));
    const fontsDir = path.join(
      path.dirname(require.resolve('katex/dist/katex.min.css')),
      'fonts',
    );
    const onDisk = fs.readdirSync(fontsDir);
    // Fixture sanity: the package really ships fallback formats.
    expect(onDisk.some(f => !f.endsWith('.woff2'))).toBe(true);
    const emitted = new Set(
      katexAssets().map(f => path.posix.basename(f.fileName)),
    );
    for (const font of onDisk) {
      expect(emitted.has(font)).toBe(font.endsWith('.woff2'));
    }
  });
});
