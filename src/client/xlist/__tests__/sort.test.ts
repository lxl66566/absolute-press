import { describe, expect, it } from 'vitest';

import {
  compareNatural,
  firstSortDir,
  itemComparator,
  nextSortDir,
  numericColumns,
  ordered,
  resolveSortable,
  type SortState,
} from '../sort';
import type { XListCell, XListItem } from '../types';

const numCmp = (a: number, b: number) => a - b;

const cell = (overrides: Partial<XListCell>): XListCell => ({
  parts: [],
  text: '',
  ...overrides,
});

const item = (title: string, cells: XListCell[] = []): XListItem => ({
  key: title,
  title,
  cells,
});

const titlesOf = (items: readonly XListItem[]) => items.map(x => x.title);

describe('compareNatural', () => {
  it('compares digit runs numerically', () => {
    expect(compareNatural('a2', 'a10')).toBeLessThan(0);
    expect(compareNatural('item 9', 'item 10')).toBeLessThan(0);
    expect(compareNatural('10', '9')).toBeGreaterThan(0);
  });

  it('ignores case and accents', () => {
    expect(compareNatural('ABC', 'abc')).toBe(0);
    expect(compareNatural('CLANNAD', 'clannad')).toBe(0);
  });
});

describe('firstSortDir', () => {
  it('starts descending on numeric (score) columns, ascending on text', () => {
    expect(firstSortDir(true)).toBe('desc');
    expect(firstSortDir(false)).toBe('asc');
  });
});

describe('nextSortDir', () => {
  it('ascends through none -> first -> flipped -> none on one header', () => {
    // Text column: asc first.
    let state: SortState | null = null;
    state = nextSortDir(state, 'title', false);
    expect(state).toEqual({ col: 'title', dir: 'asc' });
    state = nextSortDir(state, 'title', false);
    expect(state).toEqual({ col: 'title', dir: 'desc' });
    state = nextSortDir(state, 'title', false);
    expect(state).toBeNull();
  });

  it('starts from the flipped direction on numeric columns', () => {
    let state = nextSortDir(null, 2, true);
    expect(state).toEqual({ col: 2, dir: 'desc' });
    state = nextSortDir(state, 2, true);
    expect(state).toEqual({ col: 2, dir: 'asc' });
    state = nextSortDir(state, 2, true);
    expect(state).toBeNull();
  });

  it('switching headers restarts the cycle at the new column', () => {
    const state = nextSortDir({ col: 'title', dir: 'asc' }, 0, false);
    expect(state).toEqual({ col: 0, dir: 'asc' });
  });
});

describe('ordered', () => {
  it('keeps the comparator ascending and flips it descending', () => {
    expect(ordered('asc', numCmp)(1, 2)).toBeLessThan(0);
    expect(ordered('desc', numCmp)(1, 2)).toBeGreaterThan(0);
  });
});

describe('itemComparator', () => {
  it('sorts titles naturally, flipping for descending', () => {
    const items = [item('b2'), item('B10'), item('b1')];
    const asc = items.toSorted(
      itemComparator({ col: 'title', dir: 'asc' }, new Set()),
    );
    expect(titlesOf(asc)).toEqual(['b1', 'b2', 'B10']);
    const desc = items.toSorted(
      itemComparator({ col: 'title', dir: 'desc' }, new Set()),
    );
    expect(titlesOf(desc)).toEqual(['B10', 'b2', 'b1']);
  });

  it('sorts numeric columns by sortValue with keyless cells sinking', () => {
    const items = [
      item('none', [cell({ text: '-' })]),
      item('low', [cell({ sortValue: 3 })]),
      item('high', [cell({ sortValue: 9 })]),
    ];
    const numeric = new Set([0]);
    const desc = items.toSorted(
      itemComparator({ col: 0, dir: 'desc' }, numeric),
    );
    expect(titlesOf(desc)).toEqual(['high', 'low', 'none']);
    // Unscored rows sink in both directions.
    const asc = items.toSorted(itemComparator({ col: 0, dir: 'asc' }, numeric));
    expect(titlesOf(asc)).toEqual(['low', 'high', 'none']);
  });

  it('sorts text columns by cell text with numeric digit runs', () => {
    const items = [
      item('late', [cell({ text: '2026-09-24 ~ ?' })]),
      item('early', [cell({ text: '2025-12-01 ~ ?' })]),
    ];
    const sorted = items.toSorted(
      itemComparator({ col: 0, dir: 'asc' }, new Set()),
    );
    expect(titlesOf(sorted)).toEqual(['early', 'late']);
  });

  it('lets a custom comparator own its column outright', () => {
    const items = [
      item('a', [cell({ sortValue: 1 })]),
      item('b', [cell({ sortValue: 2 })]),
    ];
    const byTitleReverse = itemComparator(
      { col: 0, dir: 'asc' },
      new Set([0]),
      {
        0: (x, y) => y.title.localeCompare(x.title),
      },
    );
    expect(items.toSorted(byTitleReverse).map(x => x.key)).toEqual(['b', 'a']);
  });
});

describe('resolveSortable', () => {
  it('defaults to all columns and honors the off spellings', () => {
    expect(resolveSortable(undefined)).toBe(true);
    expect(resolveSortable(true)).toBe(true);
    expect(resolveSortable('')).toBe(true);
    expect(resolveSortable('true')).toBe(true);
    expect(resolveSortable(false)).toBe(false);
    expect(resolveSortable('false')).toBe(false);
    expect(resolveSortable('0')).toBe(false);
  });

  it('builds a header whitelist from arrays', () => {
    expect(resolveSortable(['title', 0])).toEqual(new Set(['title', 0]));
    expect(resolveSortable([2])).toEqual(new Set([2]));
  });
});

describe('numericColumns', () => {
  it('marks columns where every cell is scored or an empty placeholder', () => {
    const items = [
      { cells: [cell({ sortValue: 8 }), cell({ text: 'x' })] },
      { cells: [cell({ sortValue: 3 }), cell({ text: 'y' })] },
    ];
    expect(numericColumns(items, 2)).toEqual(new Set([0]));
  });

  it('accepts empty placeholders next to scored cells', () => {
    const items = [
      { cells: [cell({ sortValue: 8 })] },
      { cells: [cell({ empty: true, text: '-' })] },
    ];
    expect(numericColumns(items, 1)).toEqual(new Set([0]));
  });

  it('rejects columns without any sort key or with plain text cells', () => {
    const allEmpty = [{ cells: [cell({ empty: true, text: '-' })] }];
    expect(numericColumns(allEmpty, 1)).toEqual(new Set());
    const mixed = [
      { cells: [cell({ sortValue: 5 })] },
      { cells: [cell({ text: '中断' })] },
    ];
    expect(numericColumns(mixed, 1)).toEqual(new Set());
  });

  it('ignores columns beyond the visible count', () => {
    const items = [{ cells: [cell({ text: 'a' }), cell({ sortValue: 1 })] }];
    expect(numericColumns(items, 1)).toEqual(new Set());
  });
});
