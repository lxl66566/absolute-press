import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { anchorText } from '../headings.ts';
import { Slugger, slugify } from '../slugify.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

/** Parse src and return its first inline token (throws if absent). */
function firstInline(src: string): Token {
  const inline = new MarkdownIt({ html: true })
    .parse(src, {})
    .find(t => t.type === 'inline');
  if (!inline) throw new Error(`no inline token parsed from: ${src}`);
  return inline;
}

describe('slugify (ported from @mdit-vue/shared, VuePress 2 parity)', () => {
  // Every row is a case where github-slugger (the previous implementation)
  // produced a different, broken anchor.
  it.each([
    ['你好，世界', '你好-世界'],
    ['注意：重要', '注意-重要'],
    ['café 菜单', 'cafe-菜单'],
    ['a & b', 'a-b'],
    ['🎉 emoji 标题', '🎉-emoji-标题'],
    ['2024 总结', '_2024-总结'],
  ])('slugify "%s" -> "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('collapses a run of special chars into one hyphen', () => {
    expect(slugify('what?!! really...')).toBe('what-really');
  });

  it('strips leading and trailing separators', () => {
    expect(slugify('!hello!')).toBe('hello');
  });

  it('lowercases, including fullwidth letters via NFKD', () => {
    expect(slugify('Foo Bar')).toBe('foo-bar');
    expect(slugify('ＡＢＣ ｄ')).toBe('abc-d');
  });

  it('keeps CJK punctuation that NFKD does not fold to ASCII', () => {
    expect(slugify('结束。')).toBe('结束。');
  });
});

describe('Slugger dedupe (markdown-it-anchor semantics)', () => {
  it('appends -1, -2 to repeated slugs', () => {
    const slugger = new Slugger();
    expect(slugger.slug('Foo')).toBe('foo');
    expect(slugger.slug('Foo')).toBe('foo-1');
    expect(slugger.slug('foo')).toBe('foo-2');
  });
});

describe('heading slug', () => {
  it('matches VuePress on fullwidth punctuation', () => {
    const result = md.render('# 你好，世界', ENV);
    expect(result.title).toBe('你好，世界');
    expect(result.headings).toEqual([
      { level: 1, text: '你好，世界', slug: '你好-世界' },
    ]);
    expect(result.html).toContain('<h1 id="你好-世界">');
  });

  it('keeps emoji and prefixes leading digits in rendered ids', () => {
    expect(md.render('# 🎉 emoji 标题', ENV).html).toContain(
      '<h1 id="🎉-emoji-标题">',
    );
    expect(md.render('# 2024 总结', ENV).html).toContain(
      '<h1 id="_2024-总结">',
    );
  });

  it('includes code_inline content in the slug and heading text', () => {
    const result = md.render('## Use `npm i` now', ENV);
    expect(result.headings[0]).toEqual({
      level: 2,
      text: 'Use npm i now',
      slug: 'use-npm-i-now',
    });
  });

  it('dedupes repeated headings within one page', () => {
    const result = md.render('## Foo\n\n## Foo\n\n## Foo', ENV);
    expect(result.headings.map(h => h.slug)).toEqual(['foo', 'foo-1', 'foo-2']);
  });

  it('dedupes fullwidth headings too', () => {
    const result = md.render('# 你好，世界\n\n# 你好，世界', ENV);
    expect(result.headings.map(h => h.slug)).toEqual([
      '你好-世界',
      '你好-世界-1',
    ]);
  });

  it('resets slug dedupe between renders', () => {
    md.render('## Foo', ENV);
    const result = md.render('## Foo', ENV);
    expect(result.headings[0]?.slug).toBe('foo');
  });

  it('extracts title from the first h1 and keeps the h1 in the HTML', () => {
    const result = md.render('# First\n\n# Second', ENV);
    expect(result.title).toBe('First');
    expect(result.html).toContain('<h1 id="first">First</h1>');
    expect(result.html).toContain('<h1 id="second">Second</h1>');
  });

  it('returns null title without an h1', () => {
    expect(md.render('## Only h2', ENV).title).toBeNull();
  });
});

describe('slug input extraction (markdown-it-anchor parity)', () => {
  it('drops softbreak without inserting a space', () => {
    // CommonMark headings are single-line, so exercise anchorText directly
    // on real parsed tokens containing a softbreak.
    expect(anchorText(firstInline('one\ntwo `x`'))).toBe('onetwo x');
  });

  it('ignores inline html in the slug input', () => {
    expect(anchorText(firstInline('a<br>b'))).toBe('ab');
  });
});
