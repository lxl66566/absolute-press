import type { BuiltinLanguage } from 'shiki';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { MarkdownEnv, MarkdownRenderer } from '../../../shared/types.ts';
import {
  countCodeLines,
  parseCodeMeta,
  resolveCollapsedLines,
  resolveWrap,
} from '../code-meta.ts';
import type { MarkdownRendererOptions } from '../options.ts';

// The vitest setup file stubs `@shikijs/markdown-it` for the whole suite;
// this is the only file asserting real shiki output (theme CSS vars,
// transformer-driven line classes), so lift the mock here. The renderer
// chain must be imported dynamically AFTER doUnmock: a static import would
// resolve while the mock registration is still active.
vi.doUnmock('@shikijs/markdown-it');

/** Minimal language set covering every fence used in this file. */
const TEST_LANGS: BuiltinLanguage[] = [
  'javascript',
  'typescript',
  'python',
  'mermaid',
];

// One real shiki init per distinct option set; cases sharing options reuse
// the same renderer instance (shiki init is the expensive part, so it must
// not run per test case).
const rendererCache = new Map<string, Promise<MarkdownRenderer>>();

function getRenderer(
  options: MarkdownRendererOptions = {},
): Promise<MarkdownRenderer> {
  const key = JSON.stringify(options);
  let pending = rendererCache.get(key);
  if (!pending) {
    pending = import('./helpers.ts').then(({ makeRenderer }) =>
      makeRenderer({ ...options, shikiLangs: TEST_LANGS }),
    );
    rendererCache.set(key, pending);
  }
  return pending;
}

let ENV: MarkdownEnv;

beforeAll(async () => {
  ({ ENV } = await import('./helpers.ts'));
});

describe('parseCodeMeta', () => {
  it('parses single lines and ranges', () => {
    expect(parseCodeMeta('{2}').highlightLines).toEqual([2]);
    expect(parseCodeMeta('{1,3-5}').highlightLines).toEqual([1, 3, 4, 5]);
  });

  it('parses collapsed-lines and title', () => {
    const meta = parseCodeMeta('{1} :collapsed-lines=7 title="a b.ts"');
    expect(meta).toEqual({
      highlightLines: [1],
      collapsedLines: 7,
      collapsedExplicit: true,
      wrap: null,
      title: 'a b.ts',
    });
  });

  it('returns empty meta for plain attrs', () => {
    expect(parseCodeMeta('')).toEqual({
      highlightLines: [],
      collapsedLines: null,
      collapsedExplicit: false,
      wrap: null,
      title: null,
    });
  });

  it('defaults the bare :collapsed-lines flag to the theme threshold', () => {
    expect(parseCodeMeta(':collapsed-lines').collapsedLines).toBe(15);
    expect(parseCodeMeta('{1} :collapsed-lines title="x"').collapsedLines).toBe(
      15,
    );
  });

  it('lets :no-collapsed-lines explicitly disable collapsing', () => {
    expect(parseCodeMeta(':no-collapsed-lines').collapsedLines).toBeNull();
    // Explicit opt-out wins even when combined with a threshold.
    expect(
      parseCodeMeta(':collapsed-lines=5 :no-collapsed-lines').collapsedLines,
    ).toBeNull();
  });

  it('parses the :wrap override', () => {
    expect(parseCodeMeta(':wrap=false').wrap).toBe(false);
    expect(parseCodeMeta(':wrap=true {1} title="x"').wrap).toBe(true);
    expect(
      parseCodeMeta('title=":wrap=false not an override"').wrap,
    ).toBeNull();
  });
});

describe('meta resolution helpers', () => {
  it('explicit meta wins over the site default', () => {
    const meta = parseCodeMeta(':collapsed-lines=8 :wrap=false');
    expect(resolveCollapsedLines(meta, 15)).toBe(8);
    expect(resolveWrap(meta, true)).toBe(false);
  });

  it('unspecified meta falls back to the site default', () => {
    const meta = parseCodeMeta('{1}');
    expect(resolveCollapsedLines(meta, null)).toBeNull();
    expect(resolveCollapsedLines(meta, 15)).toBe(15);
    expect(resolveWrap(meta, false)).toBe(false);
  });

  it('explicit opt-out beats a site default threshold', () => {
    const meta = parseCodeMeta(':no-collapsed-lines');
    expect(resolveCollapsedLines(meta, 15)).toBeNull();
  });

  it('counts fence body lines without the trailing newline', () => {
    expect(countCodeLines('')).toBe(0);
    expect(countCodeLines('a')).toBe(1);
    expect(countCodeLines('a\nb\n')).toBe(2);
  });
});

describe('code block rendering', () => {
  let md: MarkdownRenderer;
  beforeAll(async () => {
    md = await getRenderer();
  });

  it('wraps fences in ap-code with meta attributes and dual themes', () => {
    const fence = '```';
    const src = [
      `${fence}js {2} :collapsed-lines=3 title="x.js"`,
      'const a = 1',
      'const b = 2',
      fence,
    ].join('\n');
    const result = md.render(src, ENV);
    expect(result.html).toContain(
      'class="ap-code ap-code--ln" data-lang="js" data-title="x.js"',
    );
    expect(result.html).toContain('shiki-themes');
    expect(result.html).toContain('--shiki-dark');
    // Exactly one highlighted line (line 2).
    expect(result.html.match(/highlighted/g)).toHaveLength(1);
  });

  it('emits a tools row (language label + copy button) over each fence', () => {
    const fence = '```';
    const result = md.render(`${fence}ts\nconst a = 1\n${fence}`, ENV);
    expect(result.html).toContain('<div class="ap-code__tools">');
    expect(result.html).toContain('<span class="ap-code__lang">ts</span>');
    expect(result.html).toContain('class="ap-code__copy"');
    expect(result.html).toContain('aria-label="复制代码"');
    // Mermaid is a special fence: the runtime replaces the pre with the
    // rendered diagram, so no tools row there.
    const mermaid = md.render(`${fence}mermaid\ngraph TD\n${fence}`, ENV);
    expect(mermaid.html).not.toContain('ap-code__tools');
    expect(mermaid.html).not.toContain('ap-code__copy');
  });

  it('overrides the copy button label via code.copyLabel', async () => {
    const custom = await getRenderer({ code: { copyLabel: 'Copy code' } });
    const fence = '```';
    const result = custom.render(`${fence}ts\nconst a = 1\n${fence}`, ENV);
    expect(result.html).toContain('aria-label="Copy code"');
    expect(result.html).toContain('title="Copy code"');
    expect(result.html).not.toContain('复制代码');
  });

  it('emits line-number classes and no fold for short blocks', () => {
    const fence = '```';
    const result = md.render(`${fence}ts\nconst a = 1\n${fence}`, ENV);
    expect(result.html).toContain(
      '<div class="ap-code ap-code--ln" data-lang="ts" style="--ap-ln-w:1ch">',
    );
    expect(result.html).not.toContain('ap-code--fold');
    expect(result.html).not.toContain('ap-code__fold-input');
  });

  it('emits no fold structure for the bare flag under the threshold', () => {
    const fence = '```';
    const result = md.render(
      `${fence}py :collapsed-lines\nprint(1)\n${fence}`,
      ENV,
    );
    expect(result.html).toContain(
      '<div class="ap-code ap-code--ln" data-lang="py" style="--ap-ln-w:1ch">',
    );
    expect(result.html).not.toContain('ap-code--fold');
  });

  it('emits no fold structure for :no-collapsed-lines', () => {
    const fence = '```';
    const result = md.render(
      `${fence}py :no-collapsed-lines\nprint(1)\n${fence}`,
      ENV,
    );
    expect(result.html).toContain(
      '<div class="ap-code ap-code--ln" data-lang="py" style="--ap-ln-w:1ch">',
    );
    expect(result.html).not.toContain('ap-code--fold');
  });

  it('never leaks the meta object into pre attributes', () => {
    const fence = '```';
    // Shiki copies non-underscore meta keys onto `<pre>`; the parsed object
    // must stay behind the `_abs` key or it serializes as [object Object].
    const src = [`${fence}js {1} title="leak.js"`, 'const a = 1', fence].join(
      '\n',
    );
    const result = md.render(src, ENV);
    expect(result.html).not.toContain('object Object');
    expect(result.html).not.toMatch(/<pre[^>]*\sabs=/);
    // Line highlight still works through the underscore-prefixed key.
    expect(result.html.match(/highlighted/g)).toHaveLength(1);
  });
});

/** A `ts` fence with `lines` lines of throwaway code. */
function fenceBlock(lines: number, attrs = ''): string {
  const fence = '```';
  const body = Array.from(
    { length: lines },
    (_, i) => `const v${i} = ${i};`,
  ).join('\n');
  return `${fence}ts${attrs}\n${body}\n${fence}`;
}

describe('fold structure (>threshold collapses behind a no-JS expander)', () => {
  let md: MarkdownRenderer;
  beforeAll(async () => {
    md = await getRenderer();
  });

  it('folds 16-line blocks at the default threshold of 15', () => {
    const result = md.render(fenceBlock(16), ENV);
    expect(result.html).toContain(
      'class="ap-code ap-code--ln ap-code--fold is-collapsed"',
    );
    expect(result.html).toContain(
      'style="--ap-ln-w:2ch;counter-reset:ap-lines 16"',
    );
    expect(result.html).toContain('ap-code__fold-input');
    expect(result.html).toContain(
      '<label class="ap-code__fold-toggle" for="ap-code-fold-1"></label>',
    );
    // Exactly the line(s) past the threshold carry the collapsible marker.
    expect(result.html.match(/ap-collapsible/g)).toHaveLength(1);
  });

  it('does not fold blocks at or under the threshold', () => {
    expect(md.render(fenceBlock(15), ENV).html).not.toContain('ap-code--fold');
  });

  it('honors an explicit threshold and the opt-out', () => {
    const folded = md.render(fenceBlock(8, ' :collapsed-lines=6'), ENV);
    expect(folded.html).toContain('ap-code--fold');
    expect(folded.html.match(/ap-collapsible/g)).toHaveLength(2);

    const kept = md.render(fenceBlock(20, ' :no-collapsed-lines'), ENV);
    expect(kept.html).not.toContain('ap-code--fold');
    expect(kept.html).not.toContain('ap-collapsible');
  });

  it('numbers fold checkbox ids per block within one render', () => {
    const result = md.render(
      `${fenceBlock(16)}\n\ntext\n\n${fenceBlock(16)}`,
      ENV,
    );
    expect(result.html).toContain('id="ap-code-fold-1"');
    expect(result.html).toContain('id="ap-code-fold-2"');
    expect(result.html).toContain('for="ap-code-fold-1"');
    expect(result.html).toContain('for="ap-code-fold-2"');
  });

  it('sizes the gutter inline to the last line number digit count', () => {
    expect(md.render(fenceBlock(9), ENV).html).toContain('--ap-ln-w:1ch');
    expect(md.render(fenceBlock(99), ENV).html).toContain('--ap-ln-w:2ch');
    expect(md.render(fenceBlock(100), ENV).html).toContain('--ap-ln-w:3ch');
    expect(md.render(fenceBlock(1000), ENV).html).toContain('--ap-ln-w:4ch');
  });
});

describe('wrap and line-number classes', () => {
  it('wraps by default and lets :wrap=false opt into scrolling', async () => {
    const md = await getRenderer();
    const fence = '```';
    const src = (attrs: string): string =>
      `${fence}ts${attrs}\nconst value = someObject.methodOne().methodTwo().methodThree().methodFour();\n${fence}`;
    const wrapped = md.render(src(''), ENV);
    expect(wrapped.html).not.toContain('ap-code--nowrap');
    const scrolled = md.render(src(' :wrap=false'), ENV);
    expect(scrolled.html).toContain('ap-code--nowrap');
  });

  it('supports disabling line numbers, folding and wrap site-wide', async () => {
    const md = await getRenderer({
      code: { lineNumbers: false, collapsedLines: null, wrap: false },
    });
    const fence = '```';
    const body = Array.from(
      { length: 20 },
      (_, i) => `const v${i} = ${i};`,
    ).join('\n');
    const result = md.render(`${fence}ts\n${body}\n${fence}`, ENV);
    expect(result.html).toContain(
      '<div class="ap-code ap-code--nowrap" data-lang="ts">',
    );
    expect(result.html).not.toContain('ap-code--ln');
    expect(result.html).not.toContain('ap-code--fold');
  });

  it('merges partial site-driven options over the defaults', async () => {
    // Site config used to flow through a module-level ambient state; it now
    // arrives as explicit renderer options (SiteStore passes config.code).
    // Partial semantics are unchanged: set keys win, unset keys fall back
    // to the defaults.
    const md = await getRenderer({ code: { collapsedLines: 5 } });
    const fence = '```';
    const src = `${fence}ts\nconst a = 1\n${fence}`;
    // wrap falls back to the default (soft wrap).
    expect(md.render(src, ENV).html).not.toContain('ap-code--nowrap');
    // collapsedLines: 5 (set) folds a 6-line block.
    const body = Array.from(
      { length: 6 },
      (_, i) => `const v${i} = ${i};`,
    ).join('\n');
    expect(md.render(`${fence}ts\n${body}\n${fence}`, ENV).html).toContain(
      'ap-code--fold',
    );
  });
});
