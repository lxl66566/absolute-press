/**
 * Shared search / sort / expand-state core of the two ap-xlist renderers
 * (XList and the ExpandableList island): the query -> terms split, the
 * every-term haystack match, the exclusion pass between search and sort, the
 * header-click sort cycle and the open-row set. The renderers keep only
 * their data projections: entry type, sort comparator, first-click direction
 * rule and (XList) the exclusion predicate.
 */
import { createMemo, createSignal } from 'solid-js';
import type { Accessor, Setter } from 'solid-js';

import { nextSortDir, type SortState } from './sort';

export interface EntryFilterSort<T> {
  query: Accessor<string>;
  setQuery: Setter<string>;
  sort: Accessor<SortState | null>;
  cycleSort: (col: SortState['col']) => void;
  /** Rows after search, exclusion and sort. */
  filtered: Accessor<readonly T[]>;
  isOpen: (id: number) => boolean;
  toggle: (id: number) => void;
}

export function useEntryFilterSort<T>(options: {
  /** Rows in fixed (unsorted) order. */
  entries: Accessor<readonly T[]>;
  /** Precomputed lowercase search text of one row. */
  haystack: (entry: T) => string;
  /** Rows to drop after the search pass, before sorting (exclusion filters). */
  excluded?: (entry: T) => boolean;
  /** Comparator of one sort state (only called with a non-null state). */
  comparator: (state: SortState) => (a: T, b: T) => number;
  /** Whether a column's first click sorts descending (numeric score columns). */
  descendingFirst?: (col: SortState['col']) => boolean;
}): EntryFilterSort<T> {
  const [query, setQuery] = createSignal('');
  const [sort, setSort] = createSignal<SortState | null>(null);
  const [open, setOpen] = createSignal<ReadonlySet<number>>(new Set());

  const terms = createMemo(() =>
    query()
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term !== ''),
  );

  const excluded = options.excluded;
  const filtered = createMemo(() => {
    const needle = terms();
    const source = options.entries();
    const searched =
      needle.length === 0
        ? source
        : source.filter(entry =>
            needle.every(term => options.haystack(entry).includes(term)),
          );
    // Exclusion filters hide flagged rows before sorting; the count line
    // keeps showing visible / total (hidden rows stay accounted for).
    const base =
      excluded === undefined
        ? searched
        : searched.filter(entry => !excluded(entry));
    const state = sort();
    if (state === null) return base;
    return base.toSorted(options.comparator(state));
  });

  const isOpen = (id: number): boolean => open().has(id);
  const toggle = (id: number): void => {
    const next = new Set(open());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  const cycleSort = (col: SortState['col']): void => {
    setSort(nextSortDir(sort(), col, options.descendingFirst?.(col) ?? false));
  };

  return { query, setQuery, sort, cycleSort, filtered, isOpen, toggle };
}
