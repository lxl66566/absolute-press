import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  groupTabsRadios,
  initTabsPersistence,
  initTabsPersistenceIn,
  type TabsDom,
} from '../tabs';

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

/**
 * Live wiring tests. The node env has no document/localStorage: linkedom
 * stands in for the DOM (payload.test.ts style) and an in-memory store for
 * localStorage. The wiring's module state (`wired`) keys on elements, so a
 * fresh document per test keeps cases independent.
 */
const storage = new Map<string, string>();
let writes = 0;

beforeEach(() => {
  storage.clear();
  writes = 0;
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes += 1;
      storage.set(key, value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function useDocument(html: string): Document {
  const doc = parseHTML(html).document;
  vi.stubGlobal('document', doc);
  return doc;
}

/** linkedom's checked getter is undefined when unset; normalize to boolean. */
const checkedOf = (radios: HTMLInputElement[]): boolean[] =>
  radios.map(radio => Boolean(radio.checked));

/** Dispatch an event with the document's own Event class: linkedom's
 * dispatchEvent rejects node's global one (eventPhase is settable there). */
function check(doc: Document, radio: HTMLInputElement): void {
  radio.checked = true;
  // The document's own Event class: linkedom's dispatchEvent rejects node's
  // global one (it assigns eventPhase). defaultView is typed as the lib.dom
  // window, so the instance satisfies dispatchEvent's parameter.
  radio.dispatchEvent(new doc.defaultView!.Event('change'));
}

/** Owned radios per same-id container, mirroring groupTabsRadios' ownership. */
function groupRadios(doc: Document, key: string): HTMLInputElement[][] {
  return [
    ...doc.querySelectorAll<HTMLElement>(`.ap-tabs[data-persist="${key}"]`),
  ].map(tabs =>
    [...tabs.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
      radio => radio.closest<HTMLElement>('.ap-tabs') === tabs,
    ),
  );
}

describe('initTabsPersistence wiring', () => {
  it('restores the saved index into every same-id group', () => {
    const doc = useDocument(`<div>
      <div class="ap-tabs" data-persist="x">
        <input type="radio"><input type="radio"><input type="radio">
      </div>
      <div class="ap-tabs" data-persist="x">
        <input type="radio"><input type="radio"><input type="radio">
      </div>
    </div>`);
    storage.set('ap-tabs:x', '1');
    initTabsPersistence();
    expect(groupRadios(doc, 'x').map(checkedOf)).toEqual([
      [false, true, false],
      [false, true, false],
    ]);
  });

  it('persists changes and syncs same-id siblings, nested pairs excluded', () => {
    const doc = useDocument(`<div>
      <div class="ap-tabs" data-persist="x">
        <input type="radio"><input type="radio"><input type="radio">
        <div class="ap-tabs" data-persist="x">
          <input type="radio"><input type="radio">
        </div>
      </div>
      <div class="ap-tabs" data-persist="x">
        <input type="radio"><input type="radio"><input type="radio">
      </div>
    </div>`);
    initTabsPersistence();
    const [outer, inner, sibling] = groupRadios(doc, 'x') as [
      HTMLInputElement[],
      HTMLInputElement[],
      HTMLInputElement[],
    ];
    check(doc, outer[1]!);
    expect(storage.get('ap-tabs:x')).toBe('1');
    expect(checkedOf(sibling)).toEqual([false, true, false]);
    // The nested pair shares the persist id but never syncs (corrupting
    // index mismatch).
    expect(checkedOf(inner)).toEqual([false, false]);
  });

  it('never double-wires an already-wired container', () => {
    const doc = useDocument(`<div>
      <div class="ap-tabs" data-persist="x">
        <input type="radio"><input type="radio">
      </div>
    </div>`);
    initTabsPersistence();
    const [group] = groupRadios(doc, 'x');
    check(doc, group![0]!);
    expect(writes).toBe(1);
    // A re-run (router applyPage, scoped list pass) must not stack listeners.
    initTabsPersistence();
    check(doc, group![1]!);
    expect(writes).toBe(2);
  });

  it('a scoped pass wires only fresh containers and keeps one group', () => {
    const doc = useDocument(`<div>
      <div class="ap-tabs" data-persist="x">
        <input type="radio"><input type="radio"><input type="radio">
      </div>
    </div>`);
    storage.set('ap-tabs:x', '2');
    initTabsPersistence();
    // Gate-unlock / list-row shaped late container, wired through its own
    // scope like the rebuild callbacks do.
    const scope = doc.createElement('div');
    scope.innerHTML =
      '<div class="ap-tabs" data-persist="x">' +
      '<input type="radio"><input type="radio"><input type="radio"></div>';
    doc.body.append(scope);
    initTabsPersistenceIn(scope);
    const [body, fresh] = groupRadios(doc, 'x') as [
      HTMLInputElement[],
      HTMLInputElement[],
    ];
    // The fresh group restored the saved index of the shared id.
    expect(checkedOf(fresh)).toEqual([false, false, true]);
    // Live sync runs both ways across the scope boundary: the earlier-wired
    // body group hears the fresh one and vice versa.
    check(doc, fresh[0]!);
    expect(checkedOf(body)).toEqual([true, false, false]);
    check(doc, body[2]!);
    expect(checkedOf(fresh)).toEqual([false, false, true]);
  });

  it('a scoped restore does not flatten diverged nested same-id groups', () => {
    const doc = useDocument(`<div>
      <div class="ap-tabs" data-persist="x">
        <input type="radio"><input type="radio"><input type="radio">
        <div class="ap-tabs" data-persist="x">
          <input type="radio"><input type="radio">
        </div>
      </div>
    </div>`);
    initTabsPersistence();
    const [outer, inner] = groupRadios(doc, 'x') as [
      HTMLInputElement[],
      HTMLInputElement[],
    ];
    // Nested pairs never sync, so the pair diverges against the one shared
    // storage key (inner wrote last).
    check(doc, outer[2]!);
    check(doc, inner[0]!);
    // A scoped pass for an unrelated late container must not re-apply the
    // stored index onto the out-of-scope diverged pair.
    const scope = doc.createElement('div');
    scope.innerHTML =
      '<div class="ap-tabs" data-persist="x">' +
      '<input type="radio"><input type="radio"></div>';
    doc.body.append(scope);
    initTabsPersistenceIn(scope);
    const [, , fresh] = groupRadios(doc, 'x') as [
      HTMLInputElement[],
      HTMLInputElement[],
      HTMLInputElement[],
    ];
    expect(checkedOf(fresh)).toEqual([true, false]);
    expect(checkedOf(outer)).toEqual([false, false, true]);
    expect(checkedOf(inner)).toEqual([true, false]);
  });
});
