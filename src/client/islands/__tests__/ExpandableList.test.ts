import { DOMParser } from 'linkedom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  badgeClassOf,
  cellSegments,
  inlineColumnIndexes,
  isDateCellText,
  parseChildren,
  scoreClass,
  splitTopSegments,
  splitVisibleCells,
  visibleHeaders,
} from '../expandable-list-parse';
import { flagOn } from '../props';

// parseChildren runs against the browser DOMParser; node tests borrow
// linkedom's implementation, which covers the same parser + selector surface.
beforeAll(() => {
  vi.stubGlobal('DOMParser', DOMParser);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

/** Minimal static markup as renderEntryListChildren (markdown/entries.ts)
 * emits it: preamble + item/body row pairs with meta cells. */
function xlistHtml(body: string): string {
  return (
    '<div class="ap-xlist">' +
    '<div class="ap-xlist__preamble"><p>intro</p></div>' +
    '<table class="ap-xlist__table"><tbody>' +
    body +
    '</tbody></table></div>'
  );
}

function itemRow(title: string, metas: string[]): string {
  return (
    '<tr class="ap-xlist__item">' +
    `<td class="ap-xlist__item-title">${title}</td>` +
    metas.map(m => `<td class="ap-xlist__item-meta">${m}</td>`).join('') +
    '</tr>'
  );
}

function bodyRow(html: string): string {
  return (
    '<tr class="ap-xlist__item-expanded">' +
    '<td class="ap-xlist__reveal-cell" colspan="3">' +
    `<div class="ap-xlist__item-body">${html}</div>` +
    '</td></tr>'
  );
}

describe('parseChildren', () => {
  it('zips item rows and body rows back into items', () => {
    const html = xlistHtml(
      itemRow('Clannad', ['10', '<em>2020</em>']) +
        bodyRow('<p>It was <b>great</b>.</p>') +
        itemRow('GAL', []) +
        bodyRow('<p>Short one.</p>'),
    );
    const parsed = parseChildren(html);
    expect(parsed.preamble).toBe('<p>intro</p>');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]!.id).toBe(0);
    expect(parsed.items[0]!.title).toBe('Clannad');
    expect(parsed.items[0]!.metaCells.map(cell => cell.html)).toEqual([
      '10',
      '<em>2020</em>',
    ]);
    expect(parsed.items[0]!.metaCells[0]).toMatchObject({
      score: 'is-high-score',
      empty: false,
      date: false,
    });
    expect(parsed.items[0]!.html).toBe('<p>It was <b>great</b>.</p>');
    expect(parsed.items[1]).toMatchObject({
      id: 1,
      title: 'GAL',
      html: '<p>Short one.</p>',
      offer: false,
    });
    expect(parsed.items[1]!.metaCells).toEqual([]);
  });

  it('lowercases title, meta and body text into the search haystack', () => {
    const parsed = parseChildren(
      xlistHtml(
        itemRow('CLANNAD', ['<em>Mixed</em>']) + bodyRow('<p>Key Work</p>'),
      ),
    );
    expect(parsed.items[0]!.haystack).toContain('clannad');
    expect(parsed.items[0]!.haystack).toContain('mixed');
    expect(parsed.items[0]!.haystack).toContain('key work');
  });

  it('flags cells: - placeholder, date-like, offer rows', () => {
    const parsed = parseChildren(
      xlistHtml(
        itemRow('Job', ['2024-10-10', '二面 + offer']) +
          bodyRow('') +
          itemRow('Gal', ['2026-09-24 ~ ?', '-']) +
          bodyRow(''),
      ),
    );
    expect(parsed.items[0]!.offer).toBe(true);
    expect(parsed.items[1]!.offer).toBe(false);
    const [range, score] = parsed.items[1]!.metaCells;
    expect(range).toMatchObject({ date: true });
    expect(score).toMatchObject({ empty: true, date: false });
  });

  it('survives malformed input: no root, no body rows, empty string', () => {
    expect(parseChildren('<p>not a list</p>')).toEqual({
      preamble: '',
      items: [],
    });
    expect(parseChildren('')).toEqual({ preamble: '', items: [] });
    // An item row without its body row keeps an empty (non-expandable) body.
    const orphan = parseChildren(xlistHtml(itemRow('A', [])));
    expect(orphan.items[0]!.html).toBe('');
  });
});

describe('scoreClass', () => {
  it('marks bare numbers >= 10 high, <= 0 low, in between neutral', () => {
    expect(scoreClass('10')).toBe('is-high-score');
    expect(scoreClass('10.5')).toBe('is-high-score');
    expect(scoreClass('+11')).toBe('is-high-score');
    expect(scoreClass('999999999999')).toBe('is-high-score');
    expect(scoreClass('9.99')).toBeUndefined();
    expect(scoreClass('5')).toBeUndefined();
    expect(scoreClass('0')).toBe('is-low-score');
    expect(scoreClass('-0.5')).toBe('is-low-score');
    expect(scoreClass('-3')).toBe('is-low-score');
  });

  it('strips inline tags before judging, and trims whitespace', () => {
    expect(scoreClass('<b>10</b>')).toBe('is-high-score');
    expect(scoreClass('<em>-3</em>')).toBe('is-low-score');
    expect(scoreClass(' 10 ')).toBe('is-high-score');
  });

  it('returns undefined for non-numeric cell text', () => {
    for (const cell of ['', 'abc', '10%', '1e3', 'N/A', '--']) {
      expect(scoreClass(cell)).toBeUndefined();
    }
  });
});

describe('badgeClassOf', () => {
  it('maps legacy status and tag words to tones', () => {
    expect(badgeClassOf('游玩中')).toBe('is-success');
    expect(badgeClassOf('在读')).toBe('is-success');
    expect(badgeClassOf('中断')).toBe('is-warning');
    expect(badgeClassOf('等待连载')).toBe('is-warning');
    expect(badgeClassOf('已停止')).toBe('is-danger');
    expect(badgeClassOf('已放弃')).toBe('is-danger');
    expect(badgeClassOf('黄文')).toBe('is-danger');
    expect(badgeClassOf('学习')).toBe('is-danger');
    expect(badgeClassOf('日轻')).toBe('is-info');
    expect(badgeClassOf('非严格')).toBe('is-note');
  });

  it('ports OrderBadge: #N and N刷 by rank, rest note', () => {
    expect(badgeClassOf('#1')).toBe('is-success');
    expect(badgeClassOf('#2')).toBe('is-warning');
    expect(badgeClassOf('#3')).toBe('is-danger');
    expect(badgeClassOf('#4')).toBe('is-info');
    expect(badgeClassOf('#5')).toBe('is-note');
    expect(badgeClassOf('#12')).toBe('is-note');
    expect(badgeClassOf('二刷')).toBe('is-warning');
    expect(badgeClassOf('一刷')).toBe('is-success');
    expect(badgeClassOf('三刷')).toBe('is-danger');
  });

  it('leaves unknown words alone', () => {
    for (const word of ['', '又名 x', '面试', '一面挂', '电话交流']) {
      expect(badgeClassOf(word)).toBeUndefined();
    }
  });
});

describe('splitTopSegments', () => {
  it('splits on spaced middot separators only', () => {
    expect(splitTopSegments('游玩中 · 又名 x')).toEqual(['游玩中', '又名 x']);
    expect(splitTopSegments('a·b')).toEqual(['a·b']);
    expect(splitTopSegments('a · b · c')).toEqual(['a', 'b', 'c']);
  });

  it('never splits inside tags or code spans', () => {
    expect(splitTopSegments('<a title="x · y">链接</a>')).toHaveLength(1);
    // An unspaced middot inside a tag is not a separator.
    expect(splitTopSegments('<span>·</span>')).toHaveLength(1);
    expect(splitTopSegments('`x · y`')).toEqual(['`x · y`']);
    expect(splitTopSegments('<b>a</b> · <i>b</i>')).toEqual([
      '<b>a</b>',
      '<i>b</i>',
    ]);
  });
});

describe('cellSegments', () => {
  it('badges keyword segments and keeps raw html for the rest', () => {
    const segments = cellSegments('游玩中 · 又名 ディメンション');
    expect(segments).toHaveLength(2);
    expect(segments[0]!.badge).toEqual({ text: '游玩中', cls: 'is-success' });
    expect(segments[1]!.badge).toBeUndefined();
    expect(segments[1]!.html).toBe('又名 ディメンション');
  });

  it('expands slash combos only when every piece is a badge word', () => {
    const combo = cellSegments('血腥/猎奇重口');
    expect(combo.map(s => s.badge?.text)).toEqual(['血腥', '猎奇重口']);
    expect(combo.map(s => s.badge?.cls)).toEqual(['is-warning', 'is-danger']);
    // Alias containing a slash stays one plain segment.
    const alias = cellSegments('又名 美少女万華鏡/异闻雪女');
    expect(alias).toHaveLength(1);
    expect(alias[0]!.badge).toBeUndefined();
  });

  it('keeps the plain single-segment cell untouched', () => {
    const segments = cellSegments('<a href="x">链接</a>');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({ html: '<a href="x">链接</a>' });
  });
});

describe('isDateCellText', () => {
  it('matches date ranges and single dates, nothing else', () => {
    for (const text of [
      '2026-09-24 ~ ?',
      '? ~ 2022-02-07',
      '2026-02-04',
      '2023-0?.?? ~ ?',
      '2018.10.17?',
      '<2019.07.30>',
    ]) {
      expect(isDateCellText(text)).toBe(true);
    }
    for (const text of ['22h56min', '0.02%~0.05%', '游玩中', '', 'krkr']) {
      expect(isDateCellText(text)).toBe(false);
    }
  });
});

describe('inline column redistribution', () => {
  const cols = ['书名与作者', '阅读区间', '时长', '状态', '标签', '备注'];

  it('picks meta indexes by header name, title column excluded', () => {
    const indexes = inlineColumnIndexes(cols, ['标签', '备注'], 5);
    expect([...indexes]).toEqual([3, 4]);
    expect([...inlineColumnIndexes(cols, undefined, 5)]).toEqual([]);
    expect([...inlineColumnIndexes(cols, ['不存在'], 5)]).toEqual([]);
    expect([...inlineColumnIndexes(undefined, ['标签'], 5)]).toEqual([]);
  });

  it('splits cells into visible columns plus inline html', () => {
    const cells = ['a', 'b', 'c', 'd', 'e'].map(html => ({
      html,
      empty: false,
      date: false,
      segments: [],
      badged: false,
    }));
    const split = splitVisibleCells(
      cells,
      inlineColumnIndexes(cols, ['标签', '备注'], 5),
      3,
    );
    expect(split.visible.map(cell => cell.html)).toEqual(['a', 'b', 'c']);
    expect(split.inlineHtml).toBe('d e');
    // Rows shorter than the column count get empty padding cells.
    const padded = splitVisibleCells([cells[0]!], new Set(), 3);
    expect(padded.visible).toHaveLength(3);
    expect(padded.visible[2]!.html).toBe('');
  });

  it('filters header labels to the visible columns', () => {
    expect(
      visibleHeaders(cols, inlineColumnIndexes(cols, ['标签', '备注'], 5), 3),
    ).toEqual(['阅读区间', '时长', '状态']);
  });
});

describe('flagOn', () => {
  it('falls back on undefined and on the bare-attribute empty string', () => {
    expect(flagOn(undefined, true)).toBe(true);
    expect(flagOn(undefined, false)).toBe(false);
    expect(flagOn('', true)).toBe(true);
    expect(flagOn('', false)).toBe(false);
  });

  it('passes booleans through', () => {
    expect(flagOn(true, false)).toBe(true);
    expect(flagOn(false, true)).toBe(false);
  });

  it('accepts string spellings, with explicit off-words', () => {
    expect(flagOn('true', false)).toBe(true);
    expect(flagOn('1', false)).toBe(true);
    expect(flagOn('yes', false)).toBe(true);
    expect(flagOn('false', true)).toBe(false);
    expect(flagOn('0', true)).toBe(false);
  });
});
