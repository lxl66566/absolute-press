import { describe, expect, it } from 'vitest';

import { minifyHtml } from '../minify-html.ts';

describe('minifyHtml', () => {
  it('removes whitespace between block-level closing and open tags', () => {
    const md = [
      '<h1>Title</h1>',
      '<p>para <em>em</em> text</p>',
      '<ul>',
      '<li>one</li>',
      '<li>two</li>',
      '</ul>',
      '<blockquote>',
      '<p>quote</p>',
      '</blockquote>',
    ].join('\n');
    expect(minifyHtml(`${md}\n`)).toBe(
      '<h1>Title</h1><p>para <em>em</em> text</p>' +
        '<ul>\n<li>one</li><li>two</li>\n</ul>' +
        '<blockquote>\n<p>quote</p>\n</blockquote>',
    );
  });

  it('matches tag names case-insensitively', () => {
    expect(minifyHtml('<P>a</P>\n<DIV>b</DIV>')).toBe('<P>a</P><DIV>b</DIV>');
  });

  it('keeps whitespace after a block open tag or before a closing tag', () => {
    // Left side must be a block closing or void tag: `<ul>` is open, and
    // `</li> </ul>` has a closing tag on the right, so both runs survive.
    expect(minifyHtml('<ul>\n<li>a</li>\n</ul>')).toBe(
      '<ul>\n<li>a</li>\n</ul>',
    );
  });

  it('removes whitespace after block-level void tags', () => {
    const head = [
      '<meta charset="utf-8">',
      '<title>T</title>',
      '<link rel="stylesheet" href="a.css">',
      '<style>p{color:red}</style>',
      '</head>',
    ].join('\n');
    expect(minifyHtml(head)).toBe(
      '<meta charset="utf-8"><title>T</title>' +
        '<link rel="stylesheet" href="a.css">\n<style>p{color:red}</style>\n</head>',
    );
  });

  it('treats void/non-void mixes conservatively', () => {
    expect(minifyHtml('<p>a</p>\n<hr>\n<br>\n<p>b</p>')).toBe(
      '<p>a</p><hr>\n<br>\n<p>b</p>',
    );
    expect(minifyHtml('<p>a</p>\n<hr/>\n<br/>\n<p>b</p>')).toBe(
      '<p>a</p><hr/>\n<br/>\n<p>b</p>',
    );
  });

  it('minimizes table family whitespace', () => {
    const table = [
      '<table>',
      '<thead>',
      '<tr>',
      '<th>a</th>',
      '<th>b</th>',
      '</tr>',
      '</thead>',
      '<tbody>',
      '<tr>',
      '<td>1</td>',
      '<td>2</td>',
      '</tr>',
      '</tbody>',
      '</table>',
    ].join('\n');
    expect(minifyHtml(table)).toBe(
      '<table>\n<thead>\n<tr>\n<th>a</th><th>b</th>\n</tr>\n</thead>' +
        '<tbody>\n<tr>\n<td>1</td><td>2</td>\n</tr>\n</tbody>\n</table>',
    );
  });

  it('preserves inline tag boundaries and text spacing', () => {
    const inline =
      '<p>foo <b>bar</b> baz <a href="/x">link</a></p>\n<p>next</p>';
    expect(minifyHtml(inline)).toBe(
      '<p>foo <b>bar</b> baz <a href="/x">link</a></p><p>next</p>',
    );
    expect(minifyHtml('<p><em>a</em> <a href="x">b</a></p>')).toBe(
      '<p><em>a</em> <a href="x">b</a></p>',
    );
  });

  it('never touches attribute values', () => {
    const html =
      '<p>x</p>\n<div data-props="a b" data-src="absasset:img a.png">y</div>';
    expect(minifyHtml(html)).toBe(
      '<p>x</p><div data-props="a b" data-src="absasset:img a.png">y</div>',
    );
  });

  it('preserves comments and whitespace around them', () => {
    const html = '<p>a</p>\n<!-- keep me -->\n<p>b</p>';
    expect(minifyHtml(html)).toBe(html);
  });

  it('preserves pre content verbatim and treats its boundaries as inline', () => {
    const html = '<p>a</p>\n<pre>\n  keep  <b>this</b>\n</pre>\n<p>b</p>';
    expect(minifyHtml(html)).toBe(html);
  });

  it('keeps block-like strings inside raw regions', () => {
    const html = [
      '<p>x</p>',
      '<pre>if (a) {',
      '  // looks like: </p>',
      '  // <p> block text',
      '}</pre>',
      '<p>y</p>',
    ].join('\n');
    expect(minifyHtml(html)).toBe(html);
  });

  it('keeps script/style/textarea/template/svg regions verbatim', () => {
    const html = [
      '<div>',
      '<script>if (a < b) render("</p>\\n<p>");</script>',
      '<style>.a { content: "</p>" }</style>',
      '<textarea>  raw \n text  </textarea>',
      '<template><p>raw \n content</p></template>',
      '<svg viewBox="0 0 1 1">',
      '  <path d="M0 0"/>',
      '</svg>',
      '</div>',
    ].join('\n');
    expect(minifyHtml(html)).toBe(html);
  });

  it('keeps the remainder verbatim when a raw region is unclosed', () => {
    const html = '<p>a</p>\n<script>var x = "</p>\n<p>";';
    expect(minifyHtml(html)).toBe(html);
  });

  it('resumes minifying after a closed raw region', () => {
    // The raw close search must run FORWARD from the open tag: an anchored
    // (sticky) search misses and swallows the rest of the document.
    expect(minifyHtml('<script>{}</script>\n<p>a</p>\n<p>b</p>')).toBe(
      '<script>{}</script>\n<p>a</p><p>b</p>',
    );
    expect(
      minifyHtml('<pre>  raw  </pre>\n<div></div>\n<section></section>'),
    ).toBe('<pre>  raw  </pre>\n<div></div><section></section>');
  });

  it('handles empty and whitespace-only input', () => {
    expect(minifyHtml('')).toBe('');
    expect(minifyHtml('  \n\t ')).toBe('');
  });

  it('leaves plain text untouched', () => {
    expect(minifyHtml('hello world')).toBe('hello world');
    expect(minifyHtml('a < b and c > d')).toBe('a < b and c > d');
  });

  it('trims the document ends', () => {
    expect(minifyHtml('\n  <html><body><p>x</p>\n</body></html>  ')).toBe(
      '<html><body><p>x</p>\n</body></html>',
    );
  });

  it('is idempotent', () => {
    const fixtures = [
      '<h1>T</h1>\n<p>a <em>b</em></p>\n<ul>\n<li>1</li>\n<li>2</li>\n</ul>\n',
      '<meta charset="utf-8">\n<title>T</title>\n<style>x</style>\n</head>',
      '<p>a</p>\n<hr>\n<br>\n<p>b</p>\n',
      '<pre>\n  code\n</pre>\n<p>after</p>',
      '<!-- c -->\n<p>x</p>\n<!-- d -->',
      '<table>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n</table>\n',
      '<script>var s = "</p>\n<p>";</script>\n<p>a</p>',
      'plain text only',
      '',
    ];
    for (const fixture of fixtures) {
      const once = minifyHtml(fixture);
      expect(minifyHtml(once)).toBe(once);
    }
  });
});
