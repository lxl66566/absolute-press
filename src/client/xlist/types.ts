/**
 * Contracts of the XList toolkit: typed data items + typed cell descriptors
 * + `@@@` slot bodies from the entry-list pipeline (config
 * `entryListIslands`), rendered by XList.tsx.
 */
/** One inline piece of a meta cell. */
export type XListPart =
  | { kind: 'text'; text: string }
  | { kind: 'badge'; text: string; cls: `is-${BadgeTone}` }
  | { kind: 'link'; href: string; text: string }
  | { kind: 'fold'; text: string };

/** Badge tone class suffix (`is-<tone>`); the CSS defines exactly these. */
export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'note';

/** One meta cell: ordered inline parts + presentation flags. */
export interface XListCell {
  parts: XListPart[];
  /** Pure text of every part (search index). */
  text: string;
  /** Date-like content keeps one-line width (CSS `is-date`). */
  date?: boolean;
  /** `-` placeholder renders dimmed (CSS `is-empty`). */
  empty?: boolean;
  /** Bare-number score emphasis (legacy high/low score colors). */
  score?: 'is-high-score' | 'is-low-score';
  /**
   * Numeric header-sort key (score columns). A column where every cell
   * carries a key or is an empty placeholder sorts numerically (desc first,
   * cells without a key sink to the bottom in both directions); every other
   * column sorts by cell text.
   */
  sortValue?: number;
}

/** One table row: typed data projected into cells + slot body HTML. */
export interface XListItem {
  /** Slot key (`@@@` delimiter text matching the data item). */
  key: string;
  title: string;
  /**
   * Rich title content (link/badge/fold parts) for tables whose first
   * column is not a plain label. Falls back to plain `title` text.
   */
  titleParts?: XListPart[];
  /** Meta cells in column order (inline cells included; XList splits). */
  cells: XListCell[];
  /** Slot body HTML from the entry-list pipeline. */
  bodyHtml?: string;
  /** Search-only text (hidden aliases) beyond cells/body. */
  searchExtra?: string;
  /** Whole-row highlight (legacy offer rows). */
  offer?: boolean;
  /** Exclusion-group ids this row belongs to (see `XListProps.filters`). */
  filterFlags?: string[];
}

/** One toolbar exclusion filter: checking it hides flagged rows. */
export interface XListFilter {
  /** Matches `XListItem.filterFlags` entries; active id hides flagged rows. */
  id: string;
  label: string;
  /** Native tooltip on the label explaining what gets hidden. */
  hint?: string;
}

export interface XListProps {
  items: XListItem[];
  /** Header labels: entry 0 names the title column, the rest meta columns. */
  columns?: string[];
  /** Trailing meta cells rendered inline inside the title cell. @default 0 */
  inlineCount?: number;
  /** Search box. @default true */
  searchable?: boolean;
  /**
   * Which headers get sort triangles: `true` (default) all, `false` none,
   * or an explicit whitelist of `'title'` / visible meta column indexes.
   */
  sortable?: boolean | ReadonlyArray<'title' | number>;
  /** Expandable rows with body slots. @default true */
  collapsible?: boolean;
  /** Entry count line in the toolbar. @default true */
  showCount?: boolean;
  /** The "click a row to expand" bubble under the toolbar. @default true */
  hint?: boolean;
  /**
   * Toolbar exclusion filters: checking one hides rows whose `filterFlags`
   * carry its id. The count line keeps showing visible / total so hidden
   * rows stay accounted for.
   */
  filters?: readonly XListFilter[];
  /**
   * Custom header-sort comparators keyed by `title` or a visible meta
   * column index. Each replaces that column's built-in rule (natural title
   * order / `sortValue` numeric / cell text); the framework flips the
   * arguments for descending, so the comparator always reads ascending.
   */
  sorters?: Partial<
    Record<'title' | number, (a: XListItem, b: XListItem) => number>
  >;
}
