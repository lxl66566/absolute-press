import { DOMParser } from 'linkedom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  inlineColumnIndexes,
  isDateCellText,
  parseChildren,
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
      itemRow('Alpha', ['10', '<em>2020</em>']) +
        bodyRow('<p>It was <b>great</b>.</p>') +
        itemRow('Beta', []) +
        bodyRow('<p>Short one.</p>'),
    );
    const parsed = parseChildren(html);
    expect(parsed.preamble).toBe('<p>intro</p>');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]!.id).toBe(0);
    expect(parsed.items[0]!.title).toBe('Alpha');
    expect(parsed.items[0]!.metaCells.map(cell => cell.html)).toEqual([
      '10',
      '<em>2020</em>',
    ]);
    expect(parsed.items[0]!.metaCells[0]).toMatchObject({
      text: '10',
      empty: false,
      date: false,
    });
    expect(parsed.items[0]!.html).toBe('<p>It was <b>great</b>.</p>');
    expect(parsed.items[1]).toMatchObject({
      id: 1,
      title: 'Beta',
      html: '<p>Short one.</p>',
    });
    expect(parsed.items[1]!.metaCells).toEqual([]);
  });

  it('lowercases title, meta and body text into the search haystack', () => {
    const parsed = parseChildren(
      xlistHtml(
        itemRow('ALPHA', ['<em>Mixed</em>']) + bodyRow('<p>Key Work</p>'),
      ),
    );
    expect(parsed.items[0]!.haystack).toContain('alpha');
    expect(parsed.items[0]!.haystack).toContain('mixed');
    expect(parsed.items[0]!.haystack).toContain('key work');
  });

  it('flags cells: - placeholder and date-like text', () => {
    const parsed = parseChildren(
      xlistHtml(itemRow('Gal', ['2026-09-24 ~ ?', '-']) + bodyRow('')),
    );
    const [range, score] = parsed.items[0]!.metaCells;
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
    for (const text of ['22h56min', '0.02%~0.05%', 'reading', '', 'krkr']) {
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
      text: html,
      empty: false,
      date: false,
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
