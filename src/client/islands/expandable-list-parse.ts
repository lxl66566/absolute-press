/**
 * Pure parsing layer of the ExpandableList island: meta-cell presentation
 * flags and the build-time static markup -> items extraction. No Solid, no
 * DOM beyond parseChildren's DOMParser — unit-testable in isolation (see
 * __tests__/ExpandableList.test.ts).
 *
 * The layer carries no content semantics: which words render as badge pills,
 * which numbers count as high scores, or which rows highlight is the site's
 * own call, expressed through the typed XList data path instead of string
 * sniffing here.
 */
import { zipStaticRows } from '../xlist/static';

/** Parsed meta cell: precomputed presentation flags for the table renderer. */
export interface ParsedCell {
  /** Inline HTML of the cell as rendered at build time. */
  html: string;
  /** Plain text of the cell (tags stripped) — natural-sort key. */
  text: string;
  /** `-` placeholder (the entry-list format's empty-cell marker) renders dimmed. */
  empty: boolean;
  /** Date-like cell; CSS keeps it on one line so auto layout reserves width. */
  date: boolean;
}

export interface ParsedEntry {
  /** Original position in the markdown; stable sort/search identity. */
  id: number;
  title: string;
  /** Meta cells in column order (before any `inline` redistribution). */
  metaCells: ParsedCell[];
  html: string;
  /**
   * Row index into the externalized bodies asset (data-ap-slot marker);
   * null = the body is inline in `html` (small lists, dev).
   */
  slot: number | null;
  /** Lowercased title + meta + body text for substring search. */
  haystack: string;
}

/** Plain text of one meta cell's inline HTML (tags stripped). */
function cellText(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function toCell(html: string): ParsedCell {
  const text = cellText(html).trim();
  return {
    html,
    text,
    empty: text === '-',
    date: isDateCellText(text),
  };
}

/**
 * Date-like meta cells (`2026-09-24 ~ ?`) must keep one-line width.
 * Exported for tests; the component reads the precomputed `ParsedCell.date`.
 */
export function isDateCellText(text: string): boolean {
  return text.includes(' ~ ') || /\d{4}[-.]\d{1,2}/.test(text);
}

/** Meta cell indexes whose content renders inside the title cell. */
export function inlineColumnIndexes(
  columns: readonly string[] | undefined,
  inlineNames: readonly string[] | undefined,
  metaCount: number,
): ReadonlySet<number> {
  const indexes = new Set<number>();
  if (!columns || !inlineNames) return indexes;
  columns.slice(1, metaCount + 1).forEach((name, index) => {
    if (index < metaCount && inlineNames.includes(name)) indexes.add(index);
  });
  return indexes;
}

export interface SplitCells {
  /** Cells that stay as table columns, padded to the visible column count. */
  visible: ParsedCell[];
  /** Raw HTML of the inlined cells (title-cell content). */
  inlineHtml: string;
}

/** Redistribute a row's cells into table columns + title-inline content. */
export function splitVisibleCells(
  cells: readonly ParsedCell[],
  inlineIndexes: ReadonlySet<number>,
  visibleCount: number,
): SplitCells {
  const visible: ParsedCell[] = [];
  const inline: string[] = [];
  cells.forEach((cell, index) => {
    if (inlineIndexes.has(index)) inline.push(cell.html);
    else visible.push(cell);
  });
  while (visible.length < visibleCount) {
    visible.push({ html: '', text: '', empty: false, date: false });
  }
  return { visible, inlineHtml: inline.join(' ') };
}

/** Header labels for the visible meta columns. */
export function visibleHeaders(
  columns: readonly string[],
  inlineIndexes: ReadonlySet<number>,
  visibleCount: number,
): string[] {
  const headers = columns
    .slice(1)
    .filter((_, index) => !inlineIndexes.has(index));
  while (headers.length < visibleCount) headers.push('');
  return headers.slice(0, visibleCount);
}

interface ParsedChildren {
  preamble: string;
  items: ParsedEntry[];
}

/** Extract items back out of the build-time static HTML. */
export function parseChildren(childrenHtml: string): ParsedChildren {
  const doc = new DOMParser().parseFromString(childrenHtml, 'text/html');
  const root = doc.querySelector('.ap-xlist');
  const preamble = root?.querySelector('.ap-xlist__preamble')?.innerHTML ?? '';
  const items = zipStaticRows(root).map(({ row, body }, index) => {
    const title =
      row.querySelector('.ap-xlist__item-title')?.textContent?.trim() ?? '';
    const metaCells = [...row.querySelectorAll('.ap-xlist__item-meta')].map(
      cell => toCell(cell.innerHTML),
    );
    const metaText = metaCells.map(cell => cellText(cell.html)).join('\n');
    const slotAttr = body?.getAttribute('data-ap-slot');
    return {
      id: index,
      title,
      metaCells,
      html: body?.innerHTML ?? '',
      slot:
        slotAttr === null || slotAttr === undefined ? null : Number(slotAttr),
      haystack:
        `${title}\n${metaText}\n${body?.textContent ?? ''}`.toLowerCase(),
    };
  });
  return { preamble, items };
}
