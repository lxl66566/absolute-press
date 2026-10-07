import { describe, expect, it } from 'vitest';

import { groupTabsRadios, type TabsDom } from '../tabs';

/** In-memory stand-in for the `.ap-tabs` DOM subtree (no DOM in node env). */
interface FakeTabs {
  /** `data-persist` value; undefined when absent. */
  id: string | undefined;
  /** Radios whose nearest `.ap-tabs` ancestor is this container. */
  radios: FakeRadio[];
  /** Containers nested inside this one. */
  nested: FakeTabs[];
}

interface FakeRadio {
  owner: FakeTabs;
}

/** Pre-order walk, mirroring `querySelectorAll` document order. */
function preOrder(containers: FakeTabs[]): FakeTabs[] {
  return containers.flatMap(tabs => [tabs, ...preOrder(tabs.nested)]);
}

/** Subtree radio list, mirroring `querySelectorAll('input[type=radio]')`. */
function radiosUnder(tabs: FakeTabs): FakeRadio[] {
  return [...tabs.radios, ...tabs.nested.flatMap(inner => radiosUnder(inner))];
}

function domOf(roots: FakeTabs[]): TabsDom<FakeTabs, FakeRadio> {
  return {
    persistContainers: () => preOrder(roots),
    radiosUnder,
    ownerOf: radio => radio.owner,
    persistIdOf: tabs => tabs.id,
  };
}

function makeTabs(
  id: string | undefined,
  radioCount: number,
  nested: FakeTabs[] = [],
): FakeTabs {
  const node: FakeTabs = { id, radios: [], nested };
  node.radios = Array.from({ length: radioCount }, () => ({
    owner: node,
  }));
  return node;
}

describe('groupTabsRadios', () => {
  it('groups each container with only its own radios', () => {
    const a = makeTabs('a', 2);
    const byId = groupTabsRadios(domOf([a]));
    expect(byId.size).toBe(1);
    expect(byId.get('a')).toEqual([{ tabs: a, radios: a.radios }]);
  });

  it('excludes nested container radios from the outer group (same persist id)', () => {
    const inner = makeTabs('shared', 2);
    const outer = makeTabs('shared', 3, [inner]);
    const byId = groupTabsRadios(domOf([outer]));
    const groups = byId.get('shared');
    expect(groups).toHaveLength(2);
    expect(groups?.[0]).toEqual({ tabs: outer, radios: outer.radios });
    expect(groups?.[1]).toEqual({ tabs: inner, radios: inner.radios });
  });

  it('excludes nested container radios from the outer group (distinct ids)', () => {
    const inner = makeTabs('inner', 2);
    const outer = makeTabs('outer', 2, [inner]);
    const byId = groupTabsRadios(domOf([outer]));
    // Before the fix the outer group held all 4 radios, so a saved index of
    // 2/3 checked an inner radio and hid the outer panels.
    expect(byId.get('outer')?.[0]?.radios).toEqual(outer.radios);
    expect(byId.get('inner')?.[0]?.radios).toEqual(inner.radios);
  });

  it('keeps sibling containers with one persist id as separate groups', () => {
    const first = makeTabs('shared', 2);
    const second = makeTabs('shared', 3);
    const byId = groupTabsRadios(domOf([first, second]));
    const groups = byId.get('shared');
    expect(groups).toEqual([
      { tabs: first, radios: first.radios },
      { tabs: second, radios: second.radios },
    ]);
  });

  it('drops containers without a persist id or without radios', () => {
    const noId = makeTabs(undefined, 2);
    const noRadios = makeTabs('empty', 0);
    const plain = makeTabs('kept', 1);
    const byId = groupTabsRadios(domOf([noId, noRadios, plain]));
    expect([...byId.keys()]).toEqual(['kept']);
  });
});
