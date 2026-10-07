/**
 * Tabs selection persistence for `.ap-tabs[data-persist]` (CSS-only radio
 * pattern). Restores the checked radio index from localStorage, keeps the
 * saved index fresh, and re-syncs same-page groups sharing a persist id.
 *
 * Radio names are unique per instance since the build 0.x group-name stack;
 * the shared name used to do the cross-instance sync natively but broke
 * per-group default tabs in one document, so the sync lives here instead.
 */

export interface TabsGroup<Tabs, Radio> {
  tabs: Tabs;
  radios: Radio[];
}

/**
 * DOM surface `groupTabsRadios` needs, injected so the nesting semantics are
 * unit-testable without a DOM (vitest runs in node).
 */
export interface TabsDom<Tabs, Radio> {
  /** `.ap-tabs[data-persist]` containers in document order. */
  persistContainers(): Iterable<Tabs>;
  /** Radios in `container`'s subtree in document order (`querySelectorAll`). */
  radiosUnder(container: Tabs): Iterable<Radio>;
  /** Nearest `.ap-tabs` ancestor of `radio`, or null. */
  ownerOf(radio: Radio): Tabs | null;
  /** `data-persist` value of `container`, if any. */
  persistIdOf(container: Tabs): string | undefined;
}

/**
 * Group persist-tab radios by persist id. A radio belongs to the group of its
 * NEAREST `.ap-tabs` ancestor only: `radiosUnder` on an outer container also
 * returns the radios of nested containers, and grouping those into the outer
 * group made the outer restore/checks reach into the inner panel (and the
 * inner change handler write the outer index) — the nested cross-talk bug.
 * Nested containers stay independent groups even when sharing the persist id.
 */
export function groupTabsRadios<Tabs, Radio>(
  dom: TabsDom<Tabs, Radio>,
): Map<string, TabsGroup<Tabs, Radio>[]> {
  const byId = new Map<string, TabsGroup<Tabs, Radio>[]>();
  for (const tabs of dom.persistContainers()) {
    const id = dom.persistIdOf(tabs);
    if (!id) continue;
    const radios = [...dom.radiosUnder(tabs)].filter(
      radio => dom.ownerOf(radio) === tabs,
    );
    if (radios.length === 0) continue;
    const list = byId.get(id);
    const group: TabsGroup<Tabs, Radio> = { tabs, radios: [...radios] };
    if (list) list.push(group);
    else byId.set(id, [group]);
  }
  return byId;
}

/** Uncheck every radio in `radios` and check the one at `i` (if any). */
function selectIndex(radios: HTMLInputElement[], i: number): void {
  const target = radios[i];
  if (!target) return;
  for (const radio of radios) radio.checked = false;
  target.checked = true;
}

/** Whether two containers sit on one ancestor chain (nested tabs pair). */
function nestedWith(a: HTMLElement, b: HTMLElement): boolean {
  return a.contains(b) || b.contains(a);
}

/** Wire restore + persistence + same-id live sync onto the grouped radios. */
export function initTabsPersistence(): void {
  const byId = groupTabsRadios<HTMLElement, HTMLInputElement>({
    persistContainers: () =>
      document.querySelectorAll<HTMLElement>('.ap-tabs[data-persist]'),
    radiosUnder: tabs =>
      tabs.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ownerOf: radio => radio.closest<HTMLElement>('.ap-tabs'),
    persistIdOf: tabs => tabs.dataset.persist,
  });
  for (const [id, groups] of byId) {
    const key = `ap-tabs:${id}`;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {
      // private mode etc: persistence is best-effort
    }
    const index = saved === null ? NaN : Number(saved);
    if (Number.isInteger(index)) {
      for (const { radios } of groups) selectIndex(radios, index);
    }
    // Nested pairs never sync: an outer and an inner group on one persist id
    // track radio lists of different lengths, so a shared index would corrupt
    // whichever selection is longer. Sibling groups sync as before.
    for (const { tabs, radios } of groups) {
      radios.forEach((radio, i) => {
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          try {
            localStorage.setItem(key, String(i));
          } catch {
            // best-effort
          }
          // Live-sync sibling groups with the same persist id. Programmatic
          // `checked` assignment fires no change event, so this cannot loop.
          for (const other of groups) {
            if (other.tabs === tabs || nestedWith(other.tabs, tabs)) continue;
            selectIndex(other.radios, i);
          }
        });
      });
    }
  }
}
