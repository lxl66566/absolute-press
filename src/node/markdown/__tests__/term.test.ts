import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer, TermHooks } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

const KNOWN = new Set(['known', 'nested/known']);

/** Term hooks double: the known ids resolve, misses are recorded. */
function hooks(misses: string[]): TermHooks {
  return {
    titleOf: id => (KNOWN.has(id) ? `title of ${id}` : null),
    onMiss: id => misses.push(id),
  };
}

let md: MarkdownRenderer;
let misses: string[];
beforeAll(async () => {
  misses = [];
  md = await makeRenderer({ terms: hooks(misses) });
});

/** h1 ids of a rendered ref html, in order. */
function h1Ids(html: string): string[] {
  return [...html.matchAll(/<h1 id="([^"]+)"/g)].map(m => m[1]!);
}

describe('term rule', () => {
  it('renders [[id]] as a term span carrying the ref title', () => {
    const result = md.render('see [[known]] here', ENV);
    expect(result.html).toContain(
      '<span class="ap-term" data-term="known" tabindex="0">title of known</span>',
    );
    expect(misses).toEqual([]);
  });

  it('supports subdirectory ids and [[id|display]] with inline markdown', () => {
    const result = md.render('[[nested/known|**bold** text]]', ENV);
    expect(result.html).toContain(
      '<span class="ap-term" data-term="nested/known" tabindex="0"><strong>bold</strong> text</span>',
    );
  });

  it('degrades unknown ids to plain text and reports the miss', () => {
    const result = md.render('[[unknown]] and [[unknown|kept text]]', ENV);
    expect(result.html).not.toContain('ap-term');
    expect(result.html).toContain('<p>unknown and kept text</p>');
    expect(misses).toEqual(['unknown', 'unknown']);
  });

  it('keeps literal brackets for unclosed, empty, and invalid ids', () => {
    const result = md.render(
      '[[unclosed and [[|empty]] and [[a b]] stays',
      ENV,
    );
    expect(result.html).not.toContain('ap-term');
    expect(misses).toEqual(['unknown', 'unknown']);
  });

  it('stays literal in inline code and behind a backslash escape', () => {
    const result = md.render('`[[known]]` and \\[\\[known\\]\\]', ENV);
    expect(result.html).toContain('<code>[[known]]</code>');
    expect(result.html).toContain('[[known]]</p>');
    expect(result.html).not.toContain('ap-term');
  });
});

describe('renderRef', () => {
  it('strips frontmatter and renders the body with full markdown', () => {
    const html = md.renderRef('---\ntitle: T\n---\n**bold** $E$\n', {
      filePath: '/content/reference/t.md',
    });
    expect(html).not.toContain('title: T');
    expect(html).toContain('<strong>bold</strong>');
    // Math keeps its build-time katex markup (popover pages ship the css).
    expect(html).toContain('class="katex"');
  });

  it('prefixes ids per ref so heading anchors never collide across renders', () => {
    const source = '# Same\n\n# Same\n';
    const first = md.renderRef(source, {
      filePath: '/content/reference/a.md',
    });
    const second = md.renderRef(source, {
      filePath: '/content/reference/b.md',
    });
    // The counter is renderer-global (shared with the test above), so the
    // exact numbers stay unspecified — only distinctness is the contract.
    expect(h1Ids(first)[0]).toMatch(/^ap-term-\d+-same$/);
    expect(h1Ids(second)[0]).toMatch(/^ap-term-\d+-same$/);
    expect(h1Ids(first)[0]).not.toBe(h1Ids(second)[0]);
    expect(h1Ids(first)).toEqual([h1Ids(first)[0], `${h1Ids(first)[0]}-1`]);
  });

  it('parses term references inside a ref body', () => {
    const html = md.renderRef('see [[known]]', {
      filePath: '/content/reference/c.md',
    });
    expect(html).toContain('data-term="known"');
  });
});
