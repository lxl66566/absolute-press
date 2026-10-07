import type { MarkdownIt } from 'markdown-it';
import { vi } from 'vitest';

/**
 * The option subset the stub honors. The production call site keeps the
 * full `MarkdownItShikiOptions` type; fields outside this interface only
 * feed real-shiki behavior (token coloring, transformers) that the stub
 * does not reproduce.
 */
interface StubShikiOptions {
  langs?: readonly string[];
  trimEndingNewline?: boolean;
  defaultLanguage?: string;
  fallbackLanguage?: string;
}

/**
 * Global test double for `@shikijs/markdown-it`, applied to every test file.
 *
 * Real shiki cold-starts oniguruma + every bundled grammar on each renderer
 * instance (2-3.4s each on Windows, CPU-saturating under the default worker
 * count), which dominates the unit suite although almost no test asserts
 * highlighted output. The stub keeps the plugin's contract:
 * - option surface: `defaultLanguage` / `fallbackLanguage` / `langs` /
 *   `trimEndingNewline` semantics of `setupMarkdownIt`;
 * - output structure: `shiki shiki-themes <light> <dark>` on `<pre>` (dual
 *   theme classes + `--shiki-dark` CSS variables in the style attr),
 *   `language-<lang>` on `<code>`, one `<span class="line">` per line with
 *   hast-escaped plain text; only token coloring is dropped.
 *
 * Line-level classes contributed by our transformers (`highlighted`,
 * `ap-collapsible`) are deliberately NOT reproduced: no stubbed test
 * asserts them, and code-meta.test.ts — the one file that does — opts back
 * into real shiki via `vi.doUnmock`, so this stub stays free of
 * renderer-internal logic.
 */
vi.mock('@shikijs/markdown-it', async () => {
  async function markdownItShikiStub(options: StubShikiOptions) {
    const {
      trimEndingNewline = true,
      defaultLanguage = 'text',
      fallbackLanguage,
    } = options;
    // No explicit `langs` (the production shape) means every language is
    // loaded, matching the real plugin's bundled-languages default.
    const loadedLangs = options.langs;
    // Renderer-created options always carry the dual github themes; the
    // pre markup mirrors shiki's dual-theme output for that shape.
    return (markdownit: MarkdownIt): void => {
      markdownit.options.highlight = (code, lang = 'text') => {
        let language = lang;
        if (language === '') language = defaultLanguage;
        if (
          fallbackLanguage &&
          loadedLangs &&
          !loadedLangs.includes(language)
        ) {
          language = fallbackLanguage;
        }
        const body =
          trimEndingNewline && code.endsWith('\n') ? code.slice(0, -1) : code;
        // Hast text serialization escapes `&`, `<`, `>` (quotes only in attrs).
        const lines = body
          .split('\n')
          .map(
            line =>
              `<span class="line">${line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')}</span>`,
          )
          .join('\n');
        return `<pre class="shiki shiki-themes github-light github-dark" style="background-color:#fff;--shiki-dark-bg:#24292e;color:#24292e;--shiki-dark:#e1e4e8" tabindex="0"><code class="language-${language}">${lines}</code></pre>`;
      };
    };
  }

  return { default: markdownItShikiStub };
});
