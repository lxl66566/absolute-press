import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

// Same validator the build layer applies to the `columns` prop.
import { normalizeColumns } from '../../shared/columns';
import { hydrateIslands } from '../runtime/hydrate';
import { initTabsPersistenceIn } from '../runtime/tabs';
import { cx } from '../theme/cx';
import { formatMessage, pageMessages } from '../theme/i18n';
import { RevealRow } from '../xlist/RevealRow';
import {
  columnSortDir,
  compareNatural,
  nextSortDir,
  ordered,
  resolveSortable,
  sortableHeader,
  type SortState,
} from '../xlist/sort';
import { SortHeader } from '../xlist/Sorter';
import { nextXListUid } from '../xlist/uid';
// Pure parse/cell logic lives in expandable-list-parse.ts (also imported by
// the unit tests); this file keeps the island's UI only.
import {
  inlineColumnIndexes,
  parseChildren,
  splitVisibleCells,
  visibleHeaders,
} from './expandable-list-parse';
import type { ParsedEntry } from './expandable-list-parse';
import { flagOn } from './props';

import './ExpandableList.css';

/**
 * Expandable entry list (island name: `ExpandableList`).
 *
 * Build time splits the children markdown into titled entries (`@@@ Title`
 * delimiters, see src/node/markdown/entries.ts) and renders each entry as a
 * table row: title cell + one meta cell per `@@` column, followed by a
 * full-width row with the entry body. This component parses the static
 * table back into items (expandable-list-parse.ts) and adds search /
 * header sort / per-row toggles. Nested islands inside entries (e.g.
 * ZoomedImg) are re-hydrated whenever their item re-enters the rendered
 * list.
 */
export interface ExpandableListProps {
  childrenHtml?: string;
  /** Search box on by default; disable with `:searchable="false"`. */
  searchable?: boolean | string;
  /**
   * Header sort triangles on by default (needs `columns`); disable with
   * `:sortable="false"` or whitelist columns with a JSON array:
   * `:sortable='["title", 0]'` ('title' + visible meta column indexes).
   */
  sortable?: boolean | string | ReadonlyArray<'title' | number>;
  /** Entry count line ("4 / 4 条") on by default; disable with `:showCount="false"`. */
  showCount?: boolean | string;
  /** The "click a row to expand" bubble on by default; disable with `:hint="false"`. */
  hint?: boolean | string;
  /**
   * Column header labels: entry 0 names the title column, the rest name the
   * `@@` meta columns. Pass as JSON: `:columns='["游戏名", "时长"]'`.
   */
  columns?: unknown;
  /**
   * Meta columns rendered inline inside the title cell (after the title)
   * instead of as separate columns, e.g. `:inline='["标签", "备注"]'` for
   * rows where supplementary meta follows the title. Requires
   * `columns` (columns are matched by header label); unmatched names are
   * ignored. Only affects the hydrated table — the static fallback keeps all
   * columns.
   */
  inline?: unknown;
}

/** An entry without body markdown cannot expand. */
function isExpandableRow(item: ParsedEntry): boolean {
  return item.html.trim() !== '';
}

export function ExpandableList(props: ExpandableListProps): SolidElement {
  // Islands carry no locale prop: derive messages from the page language.
  const t = pageMessages();
  const uid = nextXListUid();
  const parsed = parseChildren(props.childrenHtml ?? '');
  const cols = normalizeColumns(props.columns);
  const inlineNames = normalizeColumns(props.inline);

  // Meta cell count must be uniform across rows for the table columns to
  // line up; the static markup already pads, this guards hand-built markup.
  const metaCount = Math.max(
    0,
    ...parsed.items.map(item => item.metaCells.length),
    cols ? cols.length - 1 : 0,
  );
  const inlineIndexes = inlineColumnIndexes(cols, inlineNames, metaCount);
  const visibleMetaCount = Math.max(0, metaCount - inlineIndexes.size);

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

  // Table column index -> metaCells index (inline columns stay in the title
  // cell and are not sortable).
  const visibleMetaIndexes: readonly number[] = Array.from(
    { length: metaCount },
    (_, index) => index,
  ).filter(index => !inlineIndexes.has(index));

  const sortableSpec = resolveSortable(props.sortable);

  const cycleSort = (col: SortState['col']): void => {
    setSort(nextSortDir(sort(), col, false));
  };

  const filtered = createMemo(() => {
    const needle = terms();
    const base =
      needle.length === 0
        ? parsed.items
        : parsed.items.filter(item =>
            needle.every(term => item.haystack.includes(term)),
          );
    const state = sort();
    if (state === null) return base;
    if (state.col === 'title') {
      return base.toSorted(
        ordered(state.dir, (a, b) => compareNatural(a.title, b.title)),
      );
    }
    // Meta columns sort by natural cell-text order (the island's cells are
    // untyped HTML; numeric keys are the XList's data-driven path).
    const metaIndex = visibleMetaIndexes[state.col] ?? -1;
    return base.toSorted(
      ordered(state.dir, (a, b) =>
        compareNatural(
          a.metaCells[metaIndex]?.text ?? '',
          b.metaCells[metaIndex]?.text ?? '',
        ),
      ),
    );
  });

  const isOpen = (id: number): boolean => open().has(id);
  const toggle = (id: number): void => {
    const next = new Set(open());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  const hasExpandable = parsed.items.some(isExpandableRow);
  const searchable = flagOn(props.searchable, true);
  const showCount = flagOn(props.showCount, true);
  const showHint = flagOn(props.hint, true);

  const metaHeaders = (): readonly string[] =>
    cols === undefined
      ? []
      : visibleHeaders(cols, inlineIndexes, visibleMetaCount);

  // Entries may embed islands (ZoomedImg, Mermaid, ...) and persisted tabs.
  // Rows rebuilt by the <For> (filter/sort re-entry) carry fresh placeholder
  // markup; hydrate the component root once the DOM settles. The runtime's
  // mounted marker keeps this idempotent and coordinates with the page-wide
  // hydration pass; the tabs pass re-wires only containers it never wired.
  let rootRef: HTMLDivElement | undefined;
  createEffect(
    () =>
      filtered()
        .map(item => item.id)
        .join(','),
    () => {
      queueMicrotask(() => {
        if (!rootRef) return;
        hydrateIslands(rootRef);
        initTabsPersistenceIn(rootRef);
      });
    },
  );

  return (
    <div class="ap-xlist" ref={rootRef}>
      <Show when={parsed.preamble.trim() !== ''}>
        <div class="ap-xlist__preamble" innerHTML={parsed.preamble} />
      </Show>
      <Show when={searchable || showCount}>
        <div class="ap-xlist__toolbar">
          <Show when={searchable}>
            <input
              class="ap-xlist__search"
              type="search"
              placeholder={t.xlist.searchPlaceholder}
              aria-label={t.xlist.searchPlaceholder}
              value={query()}
              onInput={e => setQuery(e.currentTarget.value)}
            />
          </Show>
          <Show when={showCount}>
            <span class="ap-xlist__count" role="status">
              {formatMessage(t.xlist.count, {
                shown: filtered().length,
                total: parsed.items.length,
              })}
            </span>
          </Show>
        </div>
      </Show>
      <Show when={showHint && hasExpandable && parsed.items.length > 0}>
        <p class="ap-xlist__hint">{t.xlist.expandHint}</p>
      </Show>
      <Show
        when={filtered().length > 0}
        fallback={
          <p class="ap-xlist__empty" role="status">
            {t.xlist.empty}
          </p>
        }
      >
        <div class="ap-xlist__scroll">
          <table
            class={cx(
              'ap-xlist__table',
              visibleMetaCount >= 4 && 'ap-xlist__table--wide',
            )}
          >
            <colgroup>
              <col class="ap-xlist__col-title" />
              <For each={Array.from({ length: visibleMetaCount })}>
                {() => <col class="ap-xlist__col-meta" />}
              </For>
            </colgroup>
            <Show when={cols}>
              <thead>
                <tr class="ap-xlist__head-row">
                  <SortHeader
                    title
                    label={cols?.[0] ?? ''}
                    sortable={sortableHeader(sortableSpec, 'title')}
                    dir={columnSortDir(sort(), 'title')}
                    hint={t.xlist.sortToggle}
                    onToggle={() => cycleSort('title')}
                  />
                  <For each={metaHeaders()}>
                    {(header, col) => (
                      <SortHeader
                        label={header}
                        sortable={sortableHeader(sortableSpec, col())}
                        dir={columnSortDir(sort(), col())}
                        hint={t.xlist.sortToggle}
                        onToggle={() => cycleSort(col())}
                      />
                    )}
                  </For>
                </tr>
              </thead>
            </Show>
            <tbody>
              <For each={filtered()}>
                {item => {
                  const expandable = isExpandableRow(item);
                  // One split feeds both the visible cells and the
                  // title-inline html (splitting twice per row is waste).
                  const { visible: cells, inlineHtml } = splitVisibleCells(
                    item.metaCells,
                    inlineIndexes,
                    visibleMetaCount,
                  );
                  return (
                    <>
                      <tr
                        class={cx(
                          'ap-xlist__row',
                          expandable && 'is-expandable',
                          isOpen(item.id) && 'is-open',
                        )}
                        onClick={
                          expandable
                            ? (e: MouseEvent) => {
                                // Links, the title toggle and images own
                                // their clicks (images zoom via the
                                // lightbox); everything else toggles.
                                if (
                                  e.target instanceof Element &&
                                  e.target.closest('a, button, img')
                                )
                                  return;
                                toggle(item.id);
                              }
                            : undefined
                        }
                      >
                        <td
                          class="ap-xlist__cell ap-xlist__title"
                          // Same anchor as the static h6 (entries.ts);
                          // deep links survive hydration.
                          id={item.title === '' ? undefined : item.title}
                        >
                          <Show
                            when={expandable}
                            fallback={
                              <span class="ap-xlist__title-text">
                                {item.title === ''
                                  ? t.xlist.untitled
                                  : item.title}
                              </span>
                            }
                          >
                            {/* The button is the keyboard toggle; it looks
                                like plain text (the row hover reads as the
                                interactive state, not the title). */}
                            <button
                              type="button"
                              class="ap-xlist__toggle"
                              aria-expanded={isOpen(item.id) ? 'true' : 'false'}
                              aria-controls={`${uid}-${item.id}`}
                              onClick={() => toggle(item.id)}
                            >
                              {item.title === ''
                                ? t.xlist.untitled
                                : item.title}
                            </button>
                          </Show>
                          <Show when={inlineHtml !== ''}>
                            <span
                              class="ap-xlist__title-inline"
                              innerHTML={inlineHtml}
                              onClick={e => {
                                // Inline links keep native navigation; images
                                // zoom (lightbox) without toggling.
                                if (
                                  e.target instanceof Element &&
                                  e.target.closest('a, button, img')
                                )
                                  e.stopPropagation();
                              }}
                            />
                          </Show>
                        </td>
                        <For each={cells}>
                          {cell => (
                            <td
                              class={cx(
                                'ap-xlist__cell ap-xlist__item-meta',
                                cell.empty && 'is-empty',
                                cell.date && 'is-date',
                              )}
                            >
                              <span innerHTML={cell.html} />
                            </td>
                          )}
                        </For>
                      </tr>
                      <RevealRow
                        id={`${uid}-${item.id}`}
                        open={isOpen(item.id)}
                        colspan={visibleMetaCount + 1}
                        html={item.html}
                      />
                    </>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
