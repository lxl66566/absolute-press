/**
 * Entry-list islands (`ExpandableList`, plus site islands opted in via
 * config `entryListIslands`): the island's children markdown is a
 * list of titled entries separated by `@@@ Title` delimiter lines. Entries
 * are split BEFORE markdown rendering, fence-aware, then each entry renders
 * as its own markdown fragment; the client island (ExpandableList) parses the
 * static HTML back into items and adds search/sort/expand controls.
 *
 * Splitting rules:
 * - A line `@@@` (optionally indented <=3 spaces) starts a new entry; the
 *   rest of the line is the entry title (plain text, may be empty).
 * - A run of 4+ `@` is content, not a delimiter (so `@@@@` never splits).
 * - A `@@ meta` line (exactly two `@`, <=3 spaces indent) immediately after
 *   an entry delimiter attaches single-line metadata to that entry; it is
 *   rendered as INLINE markdown in the row's meta cells (used by migrated
 *   list pages for duration/score columns): block constructs never trigger,
 *   so data strings like ">10h" stay literal. Anywhere else it is plain
 *   content.
 * - Meta may carry multiple table columns, separated by top-level `|`
 *   (see splitMetaColumns); a single-segment meta stays one column, so the
 *   old `@@ a · b` spelling keeps working unchanged.
 * - Delimiters inside fenced code blocks (``` / ~~~) are content.
 * - Content before the first delimiter is a preamble, rendered above the
 *   interactive list.
 *
 * Static markup is a real table (`.ap-xlist__table`): one `<tr>` per entry
 * (title cell + one meta cell per column), followed by a full-width `<tr>`
 * with the entry body. The client island rebuilds the same shape; without
 * JS the table renders fully expanded.
 */
import { normalizeColumns } from '../../shared/columns.ts';
import { escapeHtml } from '../escape.ts';
import type { AbsCtx } from './env.ts';
import { fenceOpenOf, isFenceClose, type FenceOpen } from './fence.ts';

// One validator for both sides of the island props boundary.
export { normalizeColumns } from '../../shared/columns.ts';

/** One split entry: plain-text title + raw markdown body. */
export interface ListEntry {
  title: string;
  md: string;
  /** Raw inline markdown from a `@@ meta` line right after the delimiter. */
  meta?: string;
}

export interface EntryListSplit {
  /** Markdown before the first delimiter (may be empty). */
  preamble: string;
  entries: ListEntry[];
}

/** `@@ title` — 4+ `@` runs and deeper indentation stay content. */
const META_RE = /^ {0,3}@@(?!@)[ \t]*(.*)$/;

/** `@@@ title` — 4+ `@` runs and deeper indentation stay content. */
const DELIMITER_RE = /^ {0,3}@@@(?!@)[ \t]*(.*)$/;

/**
 * Split an entry meta string into table columns on top-level `|`.
 * `\|` is an escaped pipe (renders as `|`); pipes inside inline code spans
 * never split. Surrounding whitespace of each column is trimmed. A meta
 * without `|` yields a single column (back-compat).
 */
export function splitMetaColumns(meta: string): string[] {
  const columns: string[] = [];
  let current = '';
  let inCode = false;
  let codeRun = 0;
  for (let i = 0; i < meta.length;) {
    const ch = meta.charAt(i);
    if (ch === '\\' && !inCode && meta.charAt(i + 1) === '|') {
      current += '|';
      i += 2;
      continue;
    }
    if (ch === '`') {
      let end = i;
      while (meta.charAt(end) === '`') end += 1;
      const run = end - i;
      if (!inCode) {
        inCode = true;
        codeRun = run;
      } else if (run === codeRun) {
        inCode = false;
      }
      current += meta.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '|' && !inCode) {
      columns.push(current.trim());
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  columns.push(current.trim());
  return columns;
}

/** Split raw island children into preamble + titled entries. */
export function splitEntries(src: string): EntryListSplit {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const preambleLines: string[] = [];
  const entries: { title: string; lines: string[]; meta?: string }[] = [];
  let open: FenceOpen | null = null;
  // A `@@` line only counts as meta right after an entry delimiter.
  let afterDelimiter = false;

  const bucket = (): string[] => {
    const last = entries[entries.length - 1];
    return last ? last.lines : preambleLines;
  };

  for (const line of lines) {
    if (open) {
      if (isFenceClose(line, open)) open = null;
      bucket().push(line);
      afterDelimiter = false;
      continue;
    }
    const fence = fenceOpenOf(line);
    if (fence) {
      open = fence;
      bucket().push(line);
      afterDelimiter = false;
      continue;
    }
    const meta = afterDelimiter ? META_RE.exec(line) : null;
    if (meta) {
      const value = (meta[1] ?? '').trim();
      if (value !== '') {
        const last = entries[entries.length - 1];
        if (last) last.meta = value;
        afterDelimiter = false;
        continue;
      }
    }
    const delimiter = DELIMITER_RE.exec(line);
    if (delimiter) {
      entries.push({ title: (delimiter[1] ?? '').trim(), lines: [] });
      afterDelimiter = true;
      continue;
    }
    afterDelimiter = false;
    bucket().push(line);
  }

  return {
    preamble: preambleLines.join('\n'),
    entries: entries.map(({ title, lines: entryLines, meta }) => ({
      title,
      md: entryLines.join('\n'),
      ...(meta === undefined ? {} : { meta }),
    })),
  };
}

/**
 * Build the static (no-JS) children HTML of an entry-list island: a preamble
 * block plus a table with one row per entry (title + meta columns) and a
 * full-width row with the rendered markdown body. The client island parses
 * this structure back into items.
 *
 * `renderFragment` renders entry bodies (block markdown); `renderMeta`
 * renders meta segments as inline markdown. `props` carries the island
 * props; the optional `columns` prop labels the header row: entry 0 names
 * the title column, the rest name the meta columns. When given, every row's
 * meta cell count is padded up to `max(columns.length - 1, max segments)`
 * so columns stay aligned.
 */
export function renderEntryListChildren(
  inner: string,
  ctx: AbsCtx,
  renderFragment: (src: string, parent: AbsCtx, topLevel: boolean) => string,
  renderMeta: (src: string, parent: AbsCtx) => string,
  props?: unknown,
): string {
  const { preamble, entries } = splitEntries(inner);
  const cols = normalizeColumns(
    typeof props === 'object' && props !== null
      ? (props as Record<string, unknown>)['columns']
      : undefined,
  );
  const segsOf = entries.map(entry =>
    entry.meta === undefined ? [] : splitMetaColumns(entry.meta),
  );
  let metaCount = segsOf.reduce((max, segs) => Math.max(max, segs.length), 0);
  if (cols) metaCount = Math.max(metaCount, cols.length - 1);

  const parts: string[] = ['<div class="ap-xlist">'];
  if (preamble.trim() !== '') {
    parts.push(
      `<div class="ap-xlist__preamble">${renderFragment(preamble, ctx, false)}</div>`,
    );
  }
  const wideClass = metaCount >= 4 ? ' ap-xlist__table--wide' : '';
  parts.push(`<table class="ap-xlist__table${wideClass}">`);
  parts.push(renderColgroup(metaCount));
  if (cols) {
    parts.push('<thead><tr class="ap-xlist__head-row">');
    parts.push(
      `<th class="ap-xlist__th ap-xlist__th--title" scope="col">${escapeHtml(cols[0] ?? '')}</th>`,
    );
    for (let i = 1; i <= metaCount; i++) {
      parts.push(
        `<th class="ap-xlist__th" scope="col">${escapeHtml(cols[i] ?? '')}</th>`,
      );
    }
    parts.push('</tr></thead>');
  }
  parts.push('<tbody>');
  for (const [index, entry] of entries.entries()) {
    const metaCells = segsOf[index] ?? [];
    const cells: string[] = [];
    for (let i = 0; i < metaCount; i++) {
      const seg = metaCells[i];
      cells.push(
        seg === undefined
          ? '<td class="ap-xlist__item-meta"></td>'
          : seg.trim() === '-'
            ? // Legacy "no score" marker, rendered literally: markdown would
              // turn a bare `-` into an empty bullet list.
              '<td class="ap-xlist__item-meta is-empty">-</td>'
            : // Meta segments are single-line by construction and render as
              // inline markdown: no block <p> wrapper, and block syntax
              // (`>`/`#`/list markers) stays literal data text.
              `<td class="ap-xlist__item-meta">${renderMeta(seg, ctx)}</td>`,
      );
    }
    parts.push(
      '<tr class="ap-xlist__item">' +
        `<td class="ap-xlist__item-title">${escapeHtml(entry.title)}</td>` +
        cells.join('') +
        '</tr>',
    );
    parts.push(
      '<tr class="ap-xlist__item-expanded">' +
        `<td class="ap-xlist__reveal-cell" colspan="${metaCount + 1}">` +
        '<div class="ap-xlist__item-body">' +
        renderFragment(entry.md, ctx, false) +
        '</div>' +
        '</td>' +
        '</tr>',
    );
  }
  parts.push('</tbody>');
  parts.push('</table>');
  parts.push('</div>');
  return parts.join('\n');
}

/**
 * Column widths for the fixed-layout table: title column plus one equal
 * meta column per segment. (`--wide` for tables with 4+ meta columns goes
 * on the <table> so narrow screens can scroll instead of crushing every
 * column.)
 */
export function renderColgroup(metaCount: number): string {
  return (
    '<colgroup><col class="ap-xlist__col-title" />' +
    '<col class="ap-xlist__col-meta" />'.repeat(metaCount) +
    '</colgroup>'
  );
}
