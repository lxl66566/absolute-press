import type { MarkdownIt } from 'markdown-it';
import { describe, expect, it } from 'vitest';

import type { MarkdownPlugin, MarkdownPluginFn } from '../options.ts';
import { ENV, makeRenderer } from './helpers.ts';

// Replaces the fence renderer outright — a plugin applied after the built-in
// stack owns whatever it replaces.
const fenceOverride: MarkdownPlugin = md => {
  md.renderer.rules['fence'] = () => '<p>fence-override</p>\n';
};

// Natural plugin signature; the config type accepts it as-is.
const replacePlugin = (md: MarkdownIt, options?: { word: string }) => {
  const word = options?.word ?? 'fallback';
  md.core.ruler.push('ap-test-replace', state => {
    for (const token of state.tokens) {
      if (token.type === 'inline' && token.children) {
        for (const child of token.children) {
          if (child.type === 'text' && child.content === 'marker') {
            child.content = word;
          }
        }
      }
    }
  });
};

describe('markdown.plugins', () => {
  it('applies a plugin after the built-in stack (rule override wins)', async () => {
    const md = await makeRenderer({ plugins: [fenceOverride] });
    const result = md.render('```ts\nconst a = 1;\n```', ENV);
    // The framework's ap-code wrapper is installed first; a plugin applied
    // later is documented to own whatever it replaces.
    expect(result.html).toContain('<p>fence-override</p>');
    expect(result.html).not.toContain('ap-code');
  });

  it('passes tuple options through to the plugin', async () => {
    const md = await makeRenderer({
      plugins: [[replacePlugin, { word: 'replaced' }]],
    });
    expect(md.render('marker', ENV).html).toContain('replaced');
  });

  it('applies multiple plugins in list order', async () => {
    const order: string[] = [];
    const tag =
      (name: string): MarkdownPluginFn =>
      () => {
        order.push(name);
      };
    const md = await makeRenderer({ plugins: [tag('a'), tag('b')] });
    md.render('text', ENV);
    expect(order).toEqual(['a', 'b']);
  });
});
