import { describe, expect, it } from 'vitest';

import { createInlineMarkdownRenderer } from '../index.ts';

describe('createInlineMarkdownRenderer', () => {
  const md = createInlineMarkdownRenderer();

  it('renders core inline markdown', () => {
    expect(md.render('**bold** *em* `code` [t](https://a.b)')).toBe(
      '<strong>bold</strong> <em>em</em> <code>code</code> <a href="https://a.b">t</a>',
    );
  });

  it('keeps block syntax literal', () => {
    const html = md.render('> quote # head - list');
    expect(html).toContain('&gt; quote # head - list');
    expect(html).not.toContain('<blockquote');
    expect(html).not.toContain('<h');
  });

  it('has no footnote machinery: refs stay literal', () => {
    expect(md.render('ref[^1] here')).toBe('ref[^1] here');
  });

  it('passes raw HTML through (author-trusted strings)', () => {
    expect(md.render('a <b>b</b> c')).toBe('a <b>b</b> c');
  });

  it('renders empty input to empty output', () => {
    expect(md.render('')).toBe('');
  });

  it('renders framework inline syntaxes: mark, katex, heimu', () => {
    expect(md.render('==highlight==')).toContain('<mark>highlight</mark>');
    expect(md.render('$E=mc^2$')).toContain('katex');
    // Default-locale tooltip copy (lang omitted -> zh fallback).
    expect(md.render('!!secret!!')).toContain(
      '<span class="ap-heimu" title="你知道的太多了">secret</span>',
    );
  });

  it('bakes the heimu tooltip copy of the configured lang', () => {
    const en = createInlineMarkdownRenderer({ lang: 'en-US' });
    expect(en.render('!!secret!!')).toContain('title="You know too much"');
  });
});
