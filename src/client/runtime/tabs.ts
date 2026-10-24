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

/** Live-DOM adapter for groupTabsRadios, rooted at `root`. */
function domIn(root: ParentNode): TabsDom<HTMLElement, HTMLInputElement> {
  return {
    persistContainers: () =>
      root.querySelectorAll<HTMLElement>('.ap-tabs[data-persist]'),
    radiosUnder: tabs =>
      tabs.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ownerOf: radio => radio.closest<HTMLElement>('.ap-tabs'),
    persistIdOf: tabs => tabs.dataset.persist,
  };
}

/**
 * Containers whose radios already carry restore/sync wiring. Scoped passes
 * (gate unlock, rebuilt list rows) run over documents whose static tabs are
 * wired already; the set keeps those from collecting a second listener set
 * (double writes, double sibling syncs).
 */
const wired = new WeakSet<HTMLElement>();

/**
 * Wire tabs persistence for the `.ap-tabs[data-persist]` containers inside
 * `root` — the entry.tsx / router applyPage pass uses `document`, the
 * PasswordGate unlock rebuild and the list components' hydration callbacks
 * pass their own container (tabs there are fresh markup nobody wired yet).
 *
 * Grouping always runs over the whole document, so containers sharing a
 * persist id across the scope boundary stay one logical group; only the
 * containers inside `root` get wired — the document-wide pass handles the
 * rest. Syncing regroups at event time, so groups wired by a later scoped
 * pass still hear earlier siblings.
 */
export function initTabsPersistenceIn(root: ParentNode): void {
  const scope = new Set(
    root.querySelectorAll<HTMLElement>('.ap-tabs[data-persist]'),
  );
  for (const [id, groups] of groupTabsRadios(domIn(document))) {
    const key = `ap-tabs:${id}`;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {
      // private mode etc: persistence is best-effort
    }
    const index = saved === null ? NaN : Number(saved);
    if (Number.isInteger(index)) {
      // Restore lands on the scope's groups only: nested same-id pairs can
      // diverge (each tracks its own selection against the one shared
      // storage key), and re-applying the stored index document-wide would
      // flatten them to the last write. The document-wide entry passes a
      // full-set scope, so its behavior is unchanged; cross-scope selection
      // parity is carried by the event-time sync below.
      for (const { tabs, radios } of groups) {
        if (scope.has(tabs)) selectIndex(radios, index);
      }
    }
    for (const { tabs, radios } of groups) {
      if (!scope.has(tabs) || wired.has(tabs)) continue;
      wired.add(tabs);
      radios.forEach((radio, i) => {
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          try {
            localStorage.setItem(key, String(i));
          } catch {
            // best-effort
          }
          // Live-sync sibling groups with the same persist id, regrouped at
          // event time (a scoped pass may have wired more groups since).
          // Nested pairs never sync: an outer and an inner group on one
          // persist id track radio lists of different lengths, so a shared
          // index would corrupt whichever selection is longer. Programmatic
          // `checked` assignment fires no change event, so this cannot loop.
          for (const other of groupTabsRadios(domIn(document)).get(id) ?? []) {
            if (other.tabs === tabs || nestedWith(other.tabs, tabs)) continue;
            selectIndex(other.radios, i);
          }
        });
      });
    }
  }
}

/** Document-wide wiring (initial load, soft-navigation body swap). */
export function initTabsPersistence(): void {
  initTabsPersistenceIn(document);
}
