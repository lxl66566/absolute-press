import { describe, expect, it } from 'vitest';

import { plainExcerpt } from '../excerpt.ts';

describe('plainExcerpt', () => {
  it('strips tags and collapses whitespace to one plain-text line', () => {
    expect(plainExcerpt('<p>Hello <em>world</em> &amp; welcome</p>', 200)).toBe(
      'Hello world & welcome',
    );
  });

  it('drops script/style/pre bodies entirely', () => {
    const html =
      '<pre><code>const x = 1;</code></pre><p>Visible text</p><style>.a{color:red}</style>';
    expect(plainExcerpt(html, 200)).toBe('Visible text');
  });

  it('decodes markdown-it entities before returning plain text', () => {
    expect(
      plainExcerpt('<p>a &amp; b &#39;c&#x27; &quot;d&quot;</p>', 200),
    ).toBe(`a & b 'c' "d"`);
  });

  it('keeps unknown named entities as-is', () => {
    expect(plainExcerpt('<p>a &unknownxyz; b</p>', 200)).toBe(
      'a &unknownxyz; b',
    );
  });

  it('truncates at the limit and appends an ellipsis', () => {
    expect(plainExcerpt('<p>' + 'x'.repeat(300) + '</p>', 200)).toBe(
      'x'.repeat(200) + '…',
    );
  });

  it('returns short text unchanged at the boundary', () => {
    const text = 'x'.repeat(200);
    expect(plainExcerpt(`<p>${text}</p>`, 200)).toBe(text);
  });

  it('returns an empty string for markup without visible text', () => {
    expect(plainExcerpt('<div></div>\n\n<!-- comment -->', 160)).toBe('');
  });
});
