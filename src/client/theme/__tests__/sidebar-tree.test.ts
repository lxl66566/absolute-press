import { describe, expect, it } from 'vitest';

import type { SidebarItem } from '../../../shared/types';
import {
  activeGroupKeys,
  allGroupKeys,
  groupHasActive,
  groupKey,
  isGroupLinkActive,
  type SidebarGroup,
} from '../sidebar-tree';

const linkItem = (text: string, href: string): SidebarItem => ({
  kind: 'link',
  text,
  link: href,
});

const group = (
  text: string,
  children: SidebarItem[],
  extra: { link?: string; icon?: string } = {},
): SidebarGroup => ({
  kind: 'group',
  text,
  children,
  collapsible: true,
  ...extra,
});

/** Narrow without casts; throws on shape drift instead of lying to tsc. */
function asGroup(item: SidebarItem): SidebarGroup {
  if (item.kind !== 'group') throw new Error(`not a group: ${item.kind}`);
  return item;
}

const coding = group(
  'Coding',
  [
    group('Nested', [linkItem('Deep', '/coding/nested/deep.html')], {
      link: '/coding/nested/index.html',
    }),
    linkItem('Alpha', '/coding/alpha.html'),
  ],
  { link: '/coding/index.html' },
);
const loose = group('Loose', [linkItem('Only', '/loose/only.html')]);
const tree: SidebarItem[] = [linkItem('Home', '/index.html'), coding, loose];

describe('groupKey', () => {
  it('prefers the index route so duplicate names stay unique', () => {
    const a = group('guide', [], { link: '/a/guide/index.html' });
    const b = group('guide', [], { link: '/b/guide/index.html' });
    expect(groupKey(a)).not.toBe(groupKey(b));
    expect(groupKey(a)).toBe('/a/guide/index.html');
  });

  it('falls back to text and nests under the parent key', () => {
    const child = group('assets', []);
    expect(groupKey(child, groupKey(asGroup(coding)))).toBe(
      '/coding/index.html/assets',
    );
  });
});

describe('groupHasActive', () => {
  it('is true for the direct parent and any ancestor', () => {
    expect(groupHasActive(asGroup(coding), '/coding/alpha.html')).toBe(true);
    expect(groupHasActive(asGroup(coding), '/coding/nested/deep.html')).toBe(
      true,
    );
  });

  it('counts the folder row itself when its index is active', () => {
    expect(groupHasActive(asGroup(coding), '/coding/index.html')).toBe(true);
    // The nested folder index activates the nested group (and ancestors).
    const nested = asGroup(coding).children.find(
      child => child.kind === 'group',
    );
    if (nested?.kind !== 'group') throw new Error('nested group missing');
    expect(groupHasActive(nested, '/coding/nested/')).toBe(true);
  });

  it('is false for unrelated groups', () => {
    expect(groupHasActive(asGroup(loose), '/coding/alpha.html')).toBe(false);
  });
});

describe('activeGroupKeys', () => {
  it('returns every group on the active path, outermost first', () => {
    expect(activeGroupKeys(tree, '/coding/nested/deep.html')).toEqual([
      '/coding/index.html',
      '/coding/index.html/coding/nested/index.html',
    ]);
  });

  it('keeps the folder row group on its own index route', () => {
    expect(activeGroupKeys(tree, '/coding/index.html')).toEqual([
      '/coding/index.html',
    ]);
  });

  it('returns nothing when the active route is outside every group', () => {
    expect(activeGroupKeys(tree, '/index.html')).toEqual([]);
  });
});

describe('allGroupKeys', () => {
  it('lists every group key depth-first; index-less groups key by text', () => {
    expect(allGroupKeys(tree)).toEqual([
      '/coding/index.html',
      '/coding/index.html/coding/nested/index.html',
      '/Loose',
    ]);
    expect(allGroupKeys([])).toEqual([]);
  });
});

describe('isGroupLinkActive', () => {
  it('matches the folder index route tolerantly', () => {
    expect(isGroupLinkActive(asGroup(coding), '/coding/index.html')).toBe(true);
    expect(isGroupLinkActive(asGroup(coding), '/coding/')).toBe(true);
    expect(isGroupLinkActive(asGroup(coding), '/coding/alpha.html')).toBe(
      false,
    );
  });

  it('is false for index-less groups', () => {
    expect(isGroupLinkActive(asGroup(loose), '/loose/only.html')).toBe(false);
  });
});
