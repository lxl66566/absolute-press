/**
 * Pure parsing layer of the ExpandableList island: badges, meta-cell
 * segmentation and the build-time static markup -> items extraction. No
 * Solid, no DOM beyond parseChildren's DOMParser — unit-testable in
 * isolation (see __tests__/ExpandableList.test.ts).
 */

/** One semantic pill inside a meta cell (legacy Badge / OrderBadge port). */
export interface CellBadge {
  text: string;
  /** Badge tone class, e.g. `is-success`. */
  cls: string;
}

/** A ` · `-separated piece of a meta cell: raw HTML or a badge. */
export interface CellSegment {
  /** Raw inline HTML of the segment (badge segments keep it for search). */
  html: string;
  badge?: CellBadge;
}

/** Parsed meta cell: precomputed presentation flags for the table renderer. */
export interface XListCell {
  /** Inline HTML of the cell as rendered at build time. */
  html: string;
  /** Legacy bare-number score emphasis. */
  score?: 'is-high-score' | 'is-low-score';
  /** `-` placeholder (legacy "no score" marker) renders dimmed. */
  empty: boolean;
  /** Date-like cell; CSS keeps it on one line so auto layout reserves width. */
  date: boolean;
  segments: CellSegment[];
  /** True when any segment is a badge (switches the cell to segment render). */
  badged: boolean;
}

export interface XListItem {
  /** Original position in the markdown; stable sort/search identity. */
  id: number;
  title: string;
  /** Parsed meta cells in column order (before any `inline` redistribution). */
  metaCells: XListCell[];
  html: string;
  /** Lowercased title + body text for substring search. */
  haystack: string;
  /** Any meta cell mentions "offer" (legacy JobList green-row highlight). */
  offer: boolean;
}

/** Plain text of one meta cell's inline HTML (tags stripped). */
function cellText(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Score-cell emphasis, ported from the legacy GalListItem: a cell whose text
 * is a bare number >= 10 renders bold green; <= 0 renders red.
 */
export function scoreClass(
  html: string,
): 'is-high-score' | 'is-low-score' | undefined {
  const text = cellText(html).trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return undefined;
  const score = Number(text);
  if (score >= 10) return 'is-high-score';
  if (score <= 0) return 'is-low-score';
  return undefined;
}

/**
 * Semantic badge words, ported from the legacy vue components' Badge types
 * (GalListItem / BookListItem status + tag pills). Fixed hues live in CSS.
 */
type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'note';

const BADGE_WORDS: Readonly<Record<string, BadgeTone>> = {
  // statuses
  游玩中: 'success',
  在读: 'success',
  中断: 'warning',
  等待连载: 'warning',
  已停止: 'danger',
  已停更: 'danger',
  已放弃: 'danger',
  // tags
  推荐: 'success',
  生肉: 'success',
  无H: 'success',
  黄文: 'danger',
  学习: 'danger',
  猎奇重口: 'danger',
  惊悚: 'warning',
  血腥: 'warning',
  日轻: 'info',
  非严格: 'note',
};

/** Legacy OrderBadge: 1 tip / 2 warning / 3 danger / 4 info / rest note. */
const ORDER_TONES: readonly BadgeTone[] = [
  'success',
  'warning',
  'danger',
  'info',
];

const ZH_DIGITS: Readonly<Record<string, number>> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** Tone for `#N` order badges and `N刷` re-read badges, ported from OrderBadge. */
function orderBadgeTone(text: string): BadgeTone | undefined {
  const hash = /^#(\d+)$/.exec(text);
  const brush = /^([一二三四五六七八九十\d]+)刷$/.exec(text);
  let n: number | undefined;
  if (hash) n = Number(hash[1]);
  else if (brush) {
    const raw = brush[1] ?? '';
    n = /^\d+$/.test(raw) ? Number(raw) : ZH_DIGITS[raw];
  }
  if (n === undefined) return undefined;
  return ORDER_TONES[n - 1] ?? 'note';
}

/** Badge pill class for a standalone meta segment, if any. */
export function badgeClassOf(text: string): string | undefined {
  const tone = BADGE_WORDS[text] ?? orderBadgeTone(text);
  return tone === undefined ? undefined : `is-${tone}`;
}

/**
 * Split a rendered meta cell on top-level ` · ` separators (the legacy meta
 * segment convention). Tags and inline code spans never split.
 */
export function splitTopSegments(html: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inTag = false;
  let inCode = false;
  let codeRun = 0;
  for (let i = 0; i < html.length;) {
    const ch = html.charAt(i);
    if (inTag) {
      if (ch === '>') inTag = false;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '<') {
      inTag = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '`') {
      let end = i;
      while (html.charAt(end) === '`') end += 1;
      const run = end - i;
      if (!inCode) {
        inCode = true;
        codeRun = run;
      } else if (run === codeRun) {
        inCode = false;
      }
      current += html.slice(i, end);
      i = end;
      continue;
    }
    if (
      ch === '·' &&
      !inCode &&
      html.charAt(i - 1) === ' ' &&
      html.charAt(i + 1) === ' '
    ) {
      // The space before the middot belongs to the separator.
      segments.push(current.replace(/ $/, ''));
      current = '';
      i += 2;
      continue;
    }
    current += ch;
    i += 1;
  }
  segments.push(current);
  return segments;
}

/**
 * A segment like `血腥/猎奇重口` where EVERY slash-separated piece is a badge
 * word renders as one badge per piece (legacy tag combos); segments with any
 * non-badge piece (e.g. aliases containing `/`) stay whole.
 */
function slashBadgeSegments(segment: string): CellSegment[] | undefined {
  if (segment.includes('<') || !segment.includes('/')) return undefined;
  const pieces = segment.split('/').map(piece => piece.trim());
  const badges = pieces.map(piece => {
    const cls = badgeClassOf(piece);
    return cls === undefined ? undefined : { text: piece, cls };
  });
  if (badges.some(badge => badge === undefined)) return undefined;
  return badges.map(badge => ({ html: '', badge: badge as CellBadge }));
}

/** Parse one meta cell's HTML into badge/plain segments. */
export function cellSegments(html: string): CellSegment[] {
  const segments: CellSegment[] = [];
  for (const raw of splitTopSegments(html)) {
    const segment = raw.trim();
    if (segment === '') continue;
    const text = cellText(segment).trim();
    const slash = slashBadgeSegments(segment);
    if (slash !== undefined) {
      segments.push(...slash);
      continue;
    }
    const cls = badgeClassOf(text);
    segments.push(
      cls === undefined
        ? { html: segment }
        : { html: segment, badge: { text, cls } },
    );
  }
  return segments;
}

function toCell(html: string): XListCell {
  const segments = cellSegments(html);
  const text = cellText(html).trim();
  return {
    html,
    score: scoreClass(html),
    empty: text === '-',
    // One-line date cells (`2026-09-24 ~ ?`): CSS reserves the full token width.
    date: text.includes(' ~ ') || /\d{4}[-.]\d{1,2}/.test(text),
    segments,
    badged: segments.some(segment => segment.badge !== undefined),
  };
}

/**
 * Date-like meta cells (`2026-09-24 ~ ?`) must keep one-line width.
 * Exported for tests; the component reads the precomputed `XListCell.date`.
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
  visible: XListCell[];
  /** Raw HTML of the inlined cells (title-cell content). */
  inlineHtml: string;
}

/** Redistribute a row's cells into table columns + title-inline content. */
export function splitVisibleCells(
  cells: readonly XListCell[],
  inlineIndexes: ReadonlySet<number>,
  visibleCount: number,
): SplitCells {
  const visible: XListCell[] = [];
  const inline: string[] = [];
  cells.forEach((cell, index) => {
    if (inlineIndexes.has(index)) inline.push(cell.html);
    else visible.push(cell);
  });
  while (visible.length < visibleCount) {
    visible.push({
      html: '',
      empty: false,
      date: false,
      segments: [],
      badged: false,
    });
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
  items: XListItem[];
}

/** Extract items back out of the build-time static HTML. */
export function parseChildren(childrenHtml: string): ParsedChildren {
  const doc = new DOMParser().parseFromString(childrenHtml, 'text/html');
  const root = doc.querySelector('.ap-xlist');
  const preamble = root?.querySelector('.ap-xlist__preamble')?.innerHTML ?? '';
  // Item rows (title + meta cells) and body rows are sibling <tr>s in the
  // static table; zip them back together by position.
  const itemRows = [...(root?.querySelectorAll('.ap-xlist__item') ?? [])];
  const bodyRows = [...(root?.querySelectorAll('.ap-xlist__item-body') ?? [])];
  const items: XListItem[] = itemRows.map((el, index) => {
    const title =
      el.querySelector('.ap-xlist__item-title')?.textContent?.trim() ?? '';
    const metaCells = [...el.querySelectorAll('.ap-xlist__item-meta')].map(
      cell => toCell(cell.innerHTML),
    );
    const body = bodyRows[index];
    const metaText = metaCells.map(cell => cellText(cell.html)).join('\n');
    return {
      id: index,
      title,
      metaCells,
      html: body?.innerHTML ?? '',
      haystack:
        `${title}\n${metaText}\n${body?.textContent ?? ''}`.toLowerCase(),
      offer: metaCells.some(cell =>
        cellText(cell.html).toLowerCase().includes('offer'),
      ),
    };
  });
  return { preamble, items };
}
