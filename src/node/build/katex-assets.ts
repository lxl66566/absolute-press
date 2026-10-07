import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { devFsUrl } from './assets.ts';
// Type-only import: erased at runtime, so the module graph stays acyclic
// (site.ts is the owner of the emit contract).
import type { EmittedFile } from './site.ts';

/**
 * katex is a dependency of the absolute-press package itself, so resolve from this
 * module's URL instead of the vite root: with a `link:` install the
 * consumer's project tree has no katex of its own.
 */
function katexDistDir(): string {
  const require = createRequire(fileURLToPath(import.meta.url));
  return path.dirname(require.resolve('katex/dist/katex.min.css'));
}

/** Dev URL of katex.min.css served straight from the package. */
export function katexDevHref(): string {
  const css = path.join(katexDistDir(), 'katex.min.css');
  return devFsUrl(css);
}

/**
 * Whether a rendered page needs the KaTeX stylesheet. Both shapes the
 * renderer can leave behind are checked: `class="katex"` wraps every
 * successful KaTeX render (inline and block), `katex-error` is the
 * parse-failure fallback. Plain prose mentioning katex matches neither.
 * Raw HTML carrying these classes is a false positive — harmless, it only
 * keeps the stylesheet. Never false-negative, so formula pages can't lose
 * their styles.
 */
export function pageUsesKatex(html: string): boolean {
  return html.includes('class="katex"') || html.includes('katex-error');
}

/** Copy katex CSS + fonts into the emitted assets (build only). */
export function katexAssets(): EmittedFile[] {
  const dist = katexDistDir();
  const out: EmittedFile[] = [
    {
      fileName: 'assets/katex/katex.min.css',
      source: fs.readFileSync(path.join(dist, 'katex.min.css')),
    },
  ];
  const fontsDir = path.join(dist, 'fonts');
  if (fs.existsSync(fontsDir)) {
    for (const font of fs.readdirSync(fontsDir)) {
      // woff2 only: the @font-face src list falls back in order
      // (woff2 -> woff -> ttf) and a modern browser stops at the first
      // supported format, so the legacy files would never be requested.
      if (!font.endsWith('.woff2')) continue;
      out.push({
        fileName: `assets/katex/fonts/${font}`,
        source: fs.readFileSync(path.join(fontsDir, font)),
      });
    }
  }
  return out;
}
