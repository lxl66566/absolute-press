import { describe, expect, it } from 'vitest';

import { clampPage, pageCount, pageItems, paginate } from '../paginate';

describe('pageCount', () => {
  it('rounds up', () => {
    expect(pageCount(7, 3)).toBe(3);
    expect(pageCount(6, 3)).toBe(2);
  });

  it('is 0 for empty input or invalid perPage', () => {
    expect(pageCount(0, 3)).toBe(0);
    expect(pageCount(5, 0)).toBe(0);
  });
});

describe('clampPage', () => {
  it('clamps into [1, count]', () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(9, 3)).toBe(3);
  });

  it('falls back to 1 when count <= 0', () => {
    expect(clampPage(5, 0)).toBe(1);
  });
});

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  it('slices 1-based pages', () => {
    expect(paginate(items, 1, 3)).toEqual([1, 2, 3]);
    expect(paginate(items, 2, 3)).toEqual([4, 5, 6]);
    expect(paginate(items, 3, 3)).toEqual([7]);
  });

  it('clamps out-of-range pages', () => {
    expect(paginate(items, 99, 3)).toEqual([7]);
  });

  it('returns [] for empty items', () => {
    expect(paginate([], 1, 3)).toEqual([]);
  });
});

describe('pageItems', () => {
  it('lists all pages up to 7', () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('windows around the current page with gaps', () => {
    expect(pageItems(1, 10)).toEqual([1, 2, 'gap', 10]);
    expect(pageItems(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageItems(10, 10)).toEqual([1, 'gap', 9, 10]);
  });

  it('handles edge windows without duplicate gap', () => {
    expect(pageItems(2, 10)).toEqual([1, 2, 3, 'gap', 10]);
    expect(pageItems(9, 10)).toEqual([1, 'gap', 8, 9, 10]);
  });

  it('is empty for count 0', () => {
    expect(pageItems(1, 0)).toEqual([]);
  });
});
