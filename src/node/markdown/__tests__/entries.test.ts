import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types';
import { normalizeColumns, splitEntries, splitMetaColumns } from '../entries';
import { ENV, makeRenderer } from './helpers';

describe('splitEntries (delimiter rules)', () => {
  it('splits entries and trims titles', () => {
    const split = splitEntries('@@@ Alpha \nalpha body\n\n@@@ Beta\nbeta body');
    expect(split.preamble.trim()).toBe('');
    expect(split.entries).toEqual([
      { title: 'Alpha', md: 'alpha body\n' },
      { title: 'Beta', md: 'beta body' },
    ]);
  });

  it('keeps content before the first delimiter as preamble', () => {
    const split = splitEntries('intro paragraph\n\n@@@ A\nbody');
    expect(split.preamble).toContain('intro paragraph');
    expect(split.entries).toEqual([{ title: 'A', md: 'body' }]);
  });

  it('allows empty titles and indented delimiters', () => {
    const split = splitEntries('@@@ \nbody one\n   @@@Named\nbody two');
    expect(split.entries.map(e => e.title)).toEqual(['', 'Named']);
  });

  it('does not split on 4+ @ runs', () => {
    const split = splitEntries('@@@ A\n@@@@ not a delimiter\nstill body');
    expect(split.entries).toEqual([
      { title: 'A', md: '@@@@ not a delimiter\nstill body' },
    ]);
  });

  it('ignores delimiters inside fenced code blocks', () => {
    const src = [
      '@@@ Real',
      '```md',
      '@@@ Inside fence',
      '```',
      '@@@ Next',
      '',
    ].join('\n');
    const split = splitEntries(src);
    expect(split.entries.map(e => e.title)).toEqual(['Real', 'Next']);
    expect(split.entries[0]?.md).toContain('@@@ Inside fence');
  });

  it('supports tilde fences and unclosed fences', () => {
    const closed = splitEntries('@@@ A\n~~~\n@@@ trapped\n~~~\n@@@ B\nx');
    expect(closed.entries.map(e => e.title)).toEqual(['A', 'B']);
    const unclosed = splitEntries('@@@ A\n```\n@@@ trapped forever');
    expect(unclosed.entries.map(e => e.title)).toEqual(['A']);
    expect(unclosed.entries[0]?.md).toContain('@@@ trapped forever');
  });

  it('requires >= open length to close a fence', () => {
    const split = splitEntries(
      '@@@ A\n````md\n```\nstill in fence\n````\nafter',
    );
    expect(split.entries).toEqual([
      { title: 'A', md: '````md\n```\nstill in fence\n````\nafter' },
    ]);
  });

  it('normalizes CRLF line endings', () => {
    const split = splitEntries('@@@ A\r\nbody\r\n@@@ B\r\nbody2');
    expect(split.entries.map(e => e.title)).toEqual(['A', 'B']);
    expect(split.entries[0]?.md).toBe('body');
  });

  it('keeps an entry per delimiter even with empty bodies', () => {
    const split = splitEntries('@@@ A\n@@@ B');
    expect(split.entries.map(e => e.title)).toEqual(['A', 'B']);
    expect(split.entries.map(e => e.md)).toEqual(['', '']);
  });
});

describe('splitEntries (meta lines)', () => {
  it('attaches a @@ line right after a delimiter as entry meta', () => {
    const split = splitEntries(
      '@@@ Alpha\n@@ 23h · 剧情 9\nalpha body\n\n@@@ Beta\nbeta body',
    );
    expect(split.entries).toEqual([
      { title: 'Alpha', md: 'alpha body\n', meta: '23h · 剧情 9' },
      { title: 'Beta', md: 'beta body' },
    ]);
  });

  it('keeps @@ lines elsewhere as plain content', () => {
    const split = splitEntries(
      '@@ preamble not meta\n\n@@@ A\nbody\n@@ not meta',
    );
    expect(split.preamble).toContain('@@ preamble not meta');
    expect(split.entries).toEqual([{ title: 'A', md: 'body\n@@ not meta' }]);
  });

  it('treats 3+ @ runs after a delimiter as delimiters, not meta', () => {
    const split = splitEntries('@@@ A\n@@@ B');
    expect(split.entries.map(e => e.title)).toEqual(['A', 'B']);
    expect(split.entries.every(e => e.meta === undefined)).toBe(true);
  });

  it('accepts at most one meta line per entry', () => {
    const split = splitEntries('@@@ A\n@@ one\n@@ two\nbody');
    expect(split.entries[0]?.meta).toBe('one');
    expect(split.entries[0]?.md).toContain('@@ two');
  });
});

describe('splitMetaColumns', () => {
  it('splits on top-level | and trims columns', () => {
    expect(splitMetaColumns('23h | 2020.08 ~ 2020.09 | 8 | 7')).toEqual([
      '23h',
      '2020.08 ~ 2020.09',
      '8',
      '7',
    ]);
  });

  it('keeps a meta without | as a single column (back-compat)', () => {
    expect(splitMetaColumns('23h · 剧情 9')).toEqual(['23h · 剧情 9']);
  });

  it('does not split on escaped \\|', () => {
    expect(splitMetaColumns('a \\| b | c')).toEqual([
      'a \\| b'.replace('\\|', '|'),
      'c',
    ]);
  });

  it('does not split inside inline code spans', () => {
    expect(splitMetaColumns('`a | b` | tail')).toEqual(['`a | b`', 'tail']);
    expect(splitMetaColumns('``x||y`` | z')).toEqual(['``x||y``', 'z']);
  });

  it('keeps empty columns (padded cells) in place', () => {
    expect(splitMetaColumns('a | | c')).toEqual(['a', '', 'c']);
    expect(splitMetaColumns('a | ')).toEqual(['a', '']);
  });
});

describe('normalizeColumns', () => {
  it('accepts string arrays and rejects other shapes', () => {
    expect(normalizeColumns(['游戏名', '时长'])).toEqual(['游戏名', '时长']);
    expect(normalizeColumns([])).toBeUndefined();
    expect(normalizeColumns('游戏名')).toBeUndefined();
    expect(normalizeColumns(undefined)).toBeUndefined();
    expect(normalizeColumns([1, 'x'])).toEqual(['x']);
  });
});

describe('ExpandableList rendering', () => {
  let md: MarkdownRenderer;
  beforeAll(async () => {
    md = await makeRenderer({
      islands: [{ name: 'ExpandableList' }, { name: 'ZoomedImg' }],
    });
  });

  const xlist = (src: string): string => md.render(src, ENV).html;

  it('renders entries as table rows inside the static table', () => {
    const src = [
      '<ExpandableList>',
      '',
      'list intro',
      '',
      '@@@ First',
      '',
      '**bold** entry',
      '',
      '@@@ Second',
      '',
      '::: tip',
      'tip body',
      ':::',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    expect(html).toContain('data-ap-island="ExpandableList"');
    expect(html).toContain('ap-xlist__preamble');
    expect(html).toContain('ap-xlist__table');
    expect(html).not.toContain('<thead>');
    expect(html).toContain('<td class="ap-xlist__item-title">First</td>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('ap-container--tip');
    // Item titles are escaped plain text, not markdown.
    expect(html).not.toMatch(
      /<td class="ap-xlist__item-title">[^<]*<\/td><p><em>/,
    );
    // Each entry: one item row + one full-width expanded row.
    expect(html.match(/<tr class="ap-xlist__item">/g)).toHaveLength(2);
    expect(html.match(/<tr class="ap-xlist__item-expanded">/g)).toHaveLength(2);
  });

  it('escapes html-significant characters in titles', () => {
    const src =
      '<ExpandableList>\n\n@@@ <b>&"x"</b>\n\nbody\n\n</ExpandableList>';
    const html = xlist(src);
    expect(html).toContain(
      '<td class="ap-xlist__item-title">&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;</td>',
    );
  });

  it('keeps entry headings out of the page TOC', () => {
    const src = [
      '<ExpandableList>',
      '',
      '@@@ A',
      '',
      '## not in toc',
      '',
      '</ExpandableList>',
    ].join('\n');
    const result = md.render(src, ENV);
    expect(result.headings).toEqual([]);
    expect(result.html).toContain('<h2 id="not-in-toc">');
  });

  it('renders nested islands inside entries as placeholders', () => {
    const src = [
      '<ExpandableList>',
      '',
      '@@@ With island',
      '',
      '<ZoomedImg src="https://example.com/x.png" alt="x" />',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    expect(html).toContain('data-ap-island="ExpandableList"');
    expect(html).toContain('data-ap-island="ZoomedImg"');
  });

  it('renders meta as a single cell next to the title by default', () => {
    const src = [
      '<ExpandableList>',
      '',
      '@@@ First',
      '@@ **23h** · 剧情 9',
      '',
      'body',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    expect(html).toContain('ap-xlist__item-meta');
    expect(html).toContain('<strong>23h</strong>');
    expect(html.match(/class="ap-xlist__item-meta"/g)).toHaveLength(1);
    expect(html).toContain('<td class="ap-xlist__item-title">First</td>');
  });

  it('renders meta as inline markdown so block syntax stays literal', () => {
    // Regression: meta used to render as block markdown, so a ">10h" use_time
    // became a blockquote and "#1" a heading.
    const src = [
      '<ExpandableList>',
      '',
      '@@@ ISLAND',
      '@@ >10h | #1 | - item',
      '',
      'body',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    expect(html).toContain('<td class="ap-xlist__item-meta">&gt;10h</td>');
    expect(html).toContain('<td class="ap-xlist__item-meta">#1</td>');
    expect(html).toContain('<td class="ap-xlist__item-meta">- item</td>');
    expect(html).not.toContain('<blockquote>');
    expect(html).not.toContain('<h1');
  });

  it('resolves links inside meta cells through the link rules', () => {
    const src = [
      '<ExpandableList>',
      '',
      '@@@ Alpha',
      '@@ [资源](./target.md)',
      '',
      'body',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    expect(html).toContain(
      '<td class="ap-xlist__item-meta"><a href="/resolved/target">资源</a></td>',
    );
  });

  it('splits meta on | into one cell per column and pads shorter rows', () => {
    const src = [
      '<ExpandableList>',
      '',
      '@@@ Alpha',
      '@@ 23h | 2020.08 ~ 2020.09 | 8 | 7',
      '',
      'body',
      '',
      '@@@ Beta',
      '@@ 12h',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    // Alpha: four meta cells.
    expect(html).toContain('<td class="ap-xlist__item-meta">23h</td>');
    expect(html).toContain(
      '<td class="ap-xlist__item-meta">2020.08 ~ 2020.09</td>',
    );
    expect(html).toContain('<td class="ap-xlist__item-meta">8</td>');
    // Beta: one meta cell + three padded empty cells.
    expect(html.match(/<td class="ap-xlist__item-meta"><\/td>/g)).toHaveLength(
      3,
    );
  });

  it('renders a thead from the columns prop and labels every column', () => {
    const src = [
      '<ExpandableList :columns=\'["游戏名","时长","评分"]\'>',
      '',
      '@@@ Alpha',
      '@@ 23h | 8',
      '',
      'body',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    expect(html).toContain('<thead>');
    expect(html).toContain(
      '<th class="ap-xlist__th ap-xlist__th--title" scope="col">游戏名</th>',
    );
    expect(html).toContain('<th class="ap-xlist__th" scope="col">时长</th>');
    expect(html).toContain('<th class="ap-xlist__th" scope="col">评分</th>');
    // The expand-indicator column is gone; rows carry only titled columns.
    expect(html).not.toContain('ap-xlist__th--ctrl');
    // Two meta columns: below the wide-table threshold.
    expect(html).not.toContain('ap-xlist__table--wide');
  });

  it('pads the thead when a row carries more columns than named', () => {
    const src = [
      '<ExpandableList :columns=\'["标题","列一"]\'>',
      '',
      '@@@ Alpha',
      '@@ a | b | c',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    // metaCount = max(columns-1, segments) = 3: one labeled + two padded th.
    expect(html.match(/<th class="ap-xlist__th" scope="col">/g)).toHaveLength(
      3,
    );
    expect(html).toContain('<td class="ap-xlist__item-meta">c</td>');
  });

  it('spans the expanded row across all columns', () => {
    const src = [
      '<ExpandableList :columns=\'["标题","a","b","c","d"]\'>',
      '',
      '@@@ Alpha',
      '@@ 1 | 2 | 3 | 4',
      '',
      'body',
      '',
      '</ExpandableList>',
    ].join('\n');
    expect(xlist(src)).toContain(
      '<td class="ap-xlist__reveal-cell" colspan="5">',
    );
  });

  it('leaves delimiter-like lines inside entry code fences alone', () => {
    const src = [
      '<ExpandableList>',
      '',
      '@@@ Fenced',
      '',
      '```',
      '@@@ not an entry',
      '```',
      '',
      '</ExpandableList>',
    ].join('\n');
    const html = xlist(src);
    expect(html).toContain('data-ap-island="ExpandableList"');
    const occurrences = html.match(/ap-xlist__item-title/g);
    expect(occurrences).toHaveLength(1);
    expect(html).toContain('@@@ not an entry');
  });

  it('splits entry-list children of site islands declared via entryList', async () => {
    const siteList = await makeRenderer({
      islands: [
        { name: 'ExpandableList' },
        { name: 'MyList', entryList: true },
      ],
    });
    const src = [
      '<MyList>',
      '',
      '@@@ KEY-1',
      '',
      'body **one**',
      '',
      '@@@ KEY-2',
      '',
      'body two',
      '',
      '</MyList>',
    ].join('\n');
    const html = siteList.render(src, ENV).html;
    // Same static table skeleton as ExpandableList: title cells carry the
    // `@@@` keys, bodies render as markdown, no meta cells without `@@` lines.
    expect(html).toContain('data-ap-island="MyList"');
    expect(html).toContain('<td class="ap-xlist__item-title">KEY-1</td>');
    expect(html).toContain('<strong>one</strong>');
    expect(html).not.toContain('ap-xlist__item-meta');
    expect(html.match(/<tr class="ap-xlist__item">/g)).toHaveLength(2);
  });

  it('keeps @@@ lines literal for site islands without entryList', async () => {
    const plain = await makeRenderer({
      islands: [{ name: 'ExpandableList' }, { name: 'MyList' }],
    });
    const src = '<MyList>\n\n@@@ KEY-1\n\nbody\n\n</MyList>';
    const literal = plain.render(src, ENV).html;
    expect(literal).toContain('@@@ KEY-1');
    expect(literal).not.toContain('ap-xlist__item-title');
  });
});
