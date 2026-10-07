import { describe, expect, it } from 'vitest';

import type { Heading } from '../../../shared/types';
import {
  buildTocTree,
  flattenTocSlugs,
  tocDescendsFrom,
  tocEntryCount,
} from '../toc-tree';

const h = (level: number, text: string): Heading => ({
  level,
  text,
  slug: text.toLowerCase(),
});

describe('buildTocTree', () => {
  it('nests h3 under the preceding h2', () => {
    const tree = buildTocTree([h(2, 'A'), h(3, 'A1'), h(3, 'A2'), h(2, 'B')]);
    expect(tree.map(n => n.heading.text)).toEqual(['A', 'B']);
    expect(tree[0]?.children.map(n => n.heading.text)).toEqual(['A1', 'A2']);
    expect(tree[1]?.children).toEqual([]);
  });

  it('keeps an h3 before any h2 as top-level', () => {
    const tree = buildTocTree([h(3, 'Early'), h(2, 'A')]);
    expect(tree.map(n => n.heading.text)).toEqual(['Early', 'A']);
  });

  it('drops levels other than h2/h3', () => {
    const tree = buildTocTree([h(1, 'Title'), h(2, 'A'), h(4, 'Deep')]);
    expect(tree.map(n => n.heading.text)).toEqual(['A']);
    expect(tree[0]?.children).toEqual([]);
  });

  it('returns an empty tree for no headings', () => {
    expect(buildTocTree([])).toEqual([]);
  });
});

describe('flattenTocSlugs', () => {
  it('lists slugs in display order', () => {
    const tree = buildTocTree([h(2, 'A'), h(3, 'A1'), h(2, 'B')]);
    expect(flattenTocSlugs(tree)).toEqual(['a', 'a1', 'b']);
  });
});

describe('tocEntryCount', () => {
  it('counts roots and descendants', () => {
    const tree = buildTocTree([h(2, 'A'), h(3, 'A1'), h(3, 'A2'), h(2, 'B')]);
    expect(tocEntryCount(tree)).toBe(4);
    expect(tocEntryCount([])).toBe(0);
  });
});

describe('tocDescendsFrom', () => {
  const tree = buildTocTree([h(2, 'A'), h(3, 'A1'), h(2, 'B')]);

  it('returns the owning root for child and self slugs', () => {
    expect(tocDescendsFrom(tree, 'a1')?.heading.text).toBe('A');
    expect(tocDescendsFrom(tree, 'a')?.heading.text).toBe('A');
    expect(tocDescendsFrom(tree, 'b')?.heading.text).toBe('B');
  });

  it('returns null for unknown slugs', () => {
    expect(tocDescendsFrom(tree, 'zz')).toBeNull();
  });
});
