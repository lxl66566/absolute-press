/**
 * Pure header-sort machinery of the ap-xlist renderers (XList and the
 * ExpandableList island): sort state, the header-click cycle and the natural
 * text order. Data-in/data-out so unit tests skip the DOM.
 */
import { flagOn } from '../islands/props';
import type { XListCell, XListItem } from './types';

/** Active header sort: `title` or a visible meta column index + direction. */
export interface SortState {
  col: 'title' | number;
  dir: 'asc' | 'desc';
}

/**
 * `sortable` prop resolution: `true`/`'true'` (default) = every column,
 * `false`/`'false'`/`'0'` = none, an array = exactly those headers
 * (`'title'` and/or visible meta column indexes).
 */
export function resolveSortable(
  spec: boolean | string | ReadonlyArray<'title' | number> | undefined,
): boolean | ReadonlySet<'title' | number> {
  // Explicit typeof test, not Array.isArray: the builtin guard cannot
  // narrow ReadonlyArray out of the negative branch.
  if (spec && typeof spec !== 'boolean' && typeof spec !== 'string')
    return new Set(spec);
  return flagOn(spec, true);
}

/** Whether one header carries the sort control under a resolved spec. */
export function sortableHeader(
  spec: boolean | ReadonlySet<'title' | number>,
  col: 'title' | number,
): boolean {
  return typeof spec === 'boolean' ? spec : spec.has(col);
}

/** Natural order: base-insensitive, digit runs compared numerically. */
export function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Run a comparator in a sort direction (desc = swapped arguments). */
export function ordered<T>(
  dir: 'asc' | 'desc',
  compare: (a: T, b: T) => number,
): (a: T, b: T) => number {
  return dir === 'asc' ? compare : (a, b) => compare(b, a);
}

/** Custom per-column comparators (`XListProps.sorters` shape). */
export type SorterOverrides = Partial<
  Record<'title' | number, (a: XListItem, b: XListItem) => number>
>;

/**
 * First click direction on a header: text columns read naturally ascending;
 * score-like numeric columns start descending (high values first).
 */
export function firstSortDir(numeric: boolean): 'asc' | 'desc' {
  return numeric ? 'desc' : 'asc';
}

/** Click cycle on one header: unsorted -> first direction -> flipped -> off. */
export function nextSortDir(
  state: SortState | null,
  col: SortState['col'],
  numeric: boolean,
): SortState | null {
  const first = firstSortDir(numeric);
  if (state === null || state.col !== col) return { col, dir: first };
  if (state.dir === first)
    return { col, dir: first === 'asc' ? 'desc' : 'asc' };
  return null;
}

/** Current direction of one column under an active (or absent) sort state. */
export function columnSortDir(
  state: SortState | null,
  col: SortState['col'],
): 'asc' | 'desc' | 'none' {
  return state !== null && state.col === col ? state.dir : 'none';
}

/** `th[aria-sort]` value of one direction. */
export function ariaSortValue(
  dir: 'asc' | 'desc' | 'none',
): 'ascending' | 'descending' | undefined {
  return dir === 'asc'
    ? 'ascending'
    : dir === 'desc'
      ? 'descending'
      : undefined;
}

/**
 * Comparator of the active header, in precedence order: a custom override
 * for the column, natural title order, numeric `sortValue` (unscored cells
 * sink in both directions), natural cell-text order.
 */
export function itemComparator(
  state: SortState,
  numeric: ReadonlySet<number>,
  overrides?: SorterOverrides,
): (a: XListItem, b: XListItem) => number {
  const custom = overrides?.[state.col];
  if (custom !== undefined) return ordered(state.dir, custom);
  if (state.col === 'title') {
    return ordered(state.dir, (a, b) => compareNatural(a.title, b.title));
  }
  const col = state.col;
  if (numeric.has(col)) {
    // Deliberately NOT ordered(): swapping the arguments would flip the
    // sinking direction too. The undefined guards run before the value
    // comparison, so keyless cells sink in BOTH directions.
    return (a, b) => {
      const aValue = a.cells[col]?.sortValue;
      const bValue = b.cells[col]?.sortValue;
      if (aValue === undefined && bValue === undefined) return 0;
      if (bValue === undefined) return -1;
      if (aValue === undefined) return 1;
      return state.dir === 'asc' ? aValue - bValue : bValue - aValue;
    };
  }
  return ordered(state.dir, (a, b) =>
    compareNatural(a.cells[col]?.text ?? '', b.cells[col]?.text ?? ''),
  );
}

/**
 * Visible meta columns where every cell is scored or an empty `-`
 * placeholder and at least one carries a `sortValue` (score columns): they
 * sort numerically with unscored cells sinking; every other visible column
 * sorts by cell text.
 */
export function numericColumns(
  items: ReadonlyArray<{ cells: readonly XListCell[] }>,
  count: number,
): ReadonlySet<number> {
  const numeric = new Set<number>();
  for (let col = 0; col < count; col++) {
    let ranked = 0;
    let ok = true;
    for (const item of items) {
      const cell = item.cells[col];
      if (cell === undefined) {
        ok = false;
        break;
      }
      if (cell.sortValue !== undefined) ranked += 1;
      else if (!cell.empty) {
        ok = false;
        break;
      }
    }
    if (ok && ranked > 0) numeric.add(col);
  }
  return numeric;
}
