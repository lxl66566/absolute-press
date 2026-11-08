import { describe, expect, it } from 'vitest';

import { searchAsset, searchDocsOf } from '../search-index.ts';

describe('searchDocsOf', () => {
  it('splits a page into an intro and per-heading sections', () => {
    const docs = searchDocsOf([
      {
        route: '/guide/md',
        locale: '/',
        title: 'Markdown',
        html:
          '<p>intro text</p>' +
          '<h2 id="a">First</h2><p>alpha</p>' +
          '<h3 id="b">Second</h3><p>beta</p>',
      },
    ]);
    expect(docs.map(d => [d.id, d.heading, d.text])).toEqual([
      ['/guide/md', '', 'intro text'],
      ['/guide/md#a', 'First', 'First alpha'],
      ['/guide/md#b', 'Second', 'Second beta'],
    ]);
  });

  it('indexes a heading-only page as one whole-page section', () => {
    const docs = searchDocsOf([
      { route: '/x', locale: '/', title: 'X', html: '<p>only text</p>' },
    ]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: '/x', anchor: '', text: 'only text' });
  });

  it('strips markup, invisible blocks, and decodes entities', () => {
    const docs = searchDocsOf([
      {
        route: '/x',
        locale: '/',
        title: 'X',
        html:
          '<p>a &amp; b &lt;c&gt; &#x1F600; &nbsp;&apos;&quot;</p>' +
          '<script>var x = "nope"</script><style>.s{color:red}</style>',
      },
    ]);
    expect(docs[0]!.text).toBe('a & b <c> 😀 \'"');
  });

  it('keeps a section whose heading is its only text', () => {
    const docs = searchDocsOf([
      {
        route: '/x',
        locale: '/',
        title: 'X',
        html: '<h2 id="solo">Lone</h2><p></p>',
      },
    ]);
    expect(docs.map(d => d.text)).toEqual(['Lone']);
  });

  it('falls back to the route when the page has no title', () => {
    const docs = searchDocsOf([
      { route: '/x', locale: '/', title: '', html: '<p>text</p>' },
    ]);
    expect(docs[0]!.title).toBe('/x');
  });
});

describe('searchAsset', () => {
  it('wraps the docs in a default-exported module with a hashed name', () => {
    const docs = searchDocsOf([
      { route: '/x', locale: '/', title: 'X', html: '<p>text</p>' },
    ]);
    const { fileName, source } = searchAsset(docs);
    expect(fileName).toMatch(/^assets\/search-[0-9a-f]{8}\.js$/);
    expect(source).toBe(`export default ${JSON.stringify({ docs })};\n`);
  });

  it('keeps the name stable across rebuilds until the docs change', () => {
    const docs = searchDocsOf([
      { route: '/x', locale: '/', title: 'X', html: '<p>text</p>' },
    ]);
    expect(searchAsset(docs).fileName).toBe(searchAsset(docs).fileName);
    const changed = searchDocsOf([
      { route: '/x', locale: '/', title: 'X', html: '<p>other</p>' },
    ]);
    expect(searchAsset(changed).fileName).not.toBe(searchAsset(docs).fileName);
  });
});
