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
    group('Nested', [linkItem('Deep', '/coding/nested/deep')], {
      link: '/coding/nested/',
    }),
    linkItem('Alpha', '/coding/alpha'),
  ],
  { link: '/coding/' },
);
const loose = group('Loose', [linkItem('Only', '/loose/only')]);
const tree: SidebarItem[] = [linkItem('Home', '/'), coding, loose];

describe('groupKey', () => {
  it('prefers the index route so duplicate names stay unique', () => {
    const a = group('guide', [], { link: '/a/guide/' });
    const b = group('guide', [], { link: '/b/guide/' });
    expect(groupKey(a)).not.toBe(groupKey(b));
    expect(groupKey(a)).toBe('/a/guide/');
  });

  it('falls back to text and nests under the parent key', () => {
    const child = group('assets', []);
    expect(groupKey(child, groupKey(asGroup(coding)))).toBe('/coding//assets');
  });
});

describe('groupHasActive', () => {
  it('is true for the direct parent and any ancestor', () => {
    expect(groupHasActive(asGroup(coding), '/coding/alpha')).toBe(true);
    expect(groupHasActive(asGroup(coding), '/coding/nested/deep')).toBe(true);
  });

  it('counts the folder row itself when its index is active', () => {
    expect(groupHasActive(asGroup(coding), '/coding/')).toBe(true);
    // The nested folder index activates the nested group (and ancestors).
    const nested = asGroup(coding).children.find(
      child => child.kind === 'group',
    );
    if (nested?.kind !== 'group') throw new Error('nested group missing');
    expect(groupHasActive(nested, '/coding/nested/')).toBe(true);
  });

  it('is false for unrelated groups', () => {
    expect(groupHasActive(asGroup(loose), '/coding/alpha')).toBe(false);
  });
});

describe('activeGroupKeys', () => {
  it('returns every group on the active path, outermost first', () => {
    expect(activeGroupKeys(tree, '/coding/nested/deep')).toEqual([
      '/coding/',
      '/coding//coding/nested/',
    ]);
  });

  it('keeps the folder row group on its own index route', () => {
    expect(activeGroupKeys(tree, '/coding/')).toEqual(['/coding/']);
  });

  it('returns nothing when the active route is outside every group', () => {
    expect(activeGroupKeys(tree, '/')).toEqual([]);
  });
});

describe('allGroupKeys', () => {
  it('lists every group key depth-first; index-less groups key by text', () => {
    expect(allGroupKeys(tree)).toEqual([
      '/coding/',
      '/coding//coding/nested/',
      '/Loose',
    ]);
    expect(allGroupKeys([])).toEqual([]);
  });
});

describe('isGroupLinkActive', () => {
  it('matches the folder index route tolerantly', () => {
    // Bare and slash directory-index forms both highlight the folder row.
    expect(isGroupLinkActive(asGroup(coding), '/coding')).toBe(true);
    expect(isGroupLinkActive(asGroup(coding), '/coding/')).toBe(true);
    expect(isGroupLinkActive(asGroup(coding), '/coding/alpha')).toBe(false);
  });

  it('is false for index-less groups', () => {
    expect(isGroupLinkActive(asGroup(loose), '/loose/only')).toBe(false);
  });
});
