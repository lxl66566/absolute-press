import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { hydrateIslands } from '../runtime/hydrate';
import { cx } from '../theme/cx';
import { normalizeSvg } from '../theme/FaIcon';
import { formatMessage, pageMessages } from '../theme/i18n';
import { Fold } from './Fold';
import { RevealRow } from './RevealRow';
import {
  columnSortDir,
  itemComparator,
  nextSortDir,
  numericColumns,
  resolveSortable,
  sortableHeader,
  type SortState,
} from './sort';
import { SortHeader } from './Sorter';
import { htmlText } from './static';
import type { XListCell, XListItem, XListPart, XListProps } from './types';
import { nextXListUid } from './uid';

// The interactive half renders on top of the shared ap-xlist DOM contract:
// base table/toolbar/badge/reveal styles ship in the ExpandableList sheet
// (also statically imported here, so XList stays correct on its own),
// XList.css adds only the controls this component renders.
import '../islands/ExpandableList.css';
import './XList.css';

interface IndexedItem {
  /** Stable position in the items array: expand-state + aria ids. */
  id: number;
  item: XListItem;
  /** Precomputed search haystack. */
  haystack: string;
}

function PartView(props: { part: XListPart }): SolidElement {
  switch (props.part.kind) {
    case 'badge':
      return (
        <span class={`ap-xlist__badge ${props.part.cls}`}>
          {props.part.text}
        </span>
      );
    case 'link':
      return (
        <a href={props.part.href} target="_blank" rel="noopener noreferrer">
          {props.part.text}
        </a>
      );
    case 'fold':
      return <Fold>{props.part.text}</Fold>;
    case 'icon':
      return (
        <span
          class={cx('ap-xlist__icon', props.part.cls)}
          title={props.part.title}
          aria-hidden="true"
          innerHTML={normalizeSvg(props.part.svg) ?? ''}
        />
      );
    case 'break':
      return <br />;
    default:
      return <>{props.part.text}</>;
  }
}

/** Whether a title carries parts that must not nest inside the toggle
 * button: interactive descendants are unreachable by keyboard there. */
const interactiveTitle = (parts: readonly XListPart[] | undefined): boolean =>
  (parts ?? []).some(part => part.kind === 'link' || part.kind === 'fold');

/** Title content shared by the toggle button and the plain-text fallback. */
function TitleView(props: { item: XListItem }): SolidElement {
  return (
    <Show when={props.item.titleParts} fallback={props.item.title}>
      {parts => <PartsView parts={parts() ?? []} />}
    </Show>
  );
}
/** Render a cell's parts (badges carry their own margin;
 * a `break` is a hard line break, so neither side gets the inter-part space). */
function PartsView(props: { parts: readonly XListPart[] }): SolidElement {
  return (
    <For each={props.parts}>
      {(part, index) => (
        <>
          <Show
            when={
              index() > 0 &&
              props.parts[index() - 1]?.kind !== 'badge' &&
              props.parts[index() - 1]?.kind !== 'break' &&
              part.kind !== 'break'
            }
          >
            {' '}
          </Show>
          <PartView part={part} />
        </>
      )}
    </For>
  );
}

/**
 * Data-driven entry table: typed items in, header-click sorting (title +
 * meta columns; score columns via `sortValue`, everything else by natural
 * cell-text order, per-column overrides via `sorters`) / search / exclusion
 * filters / expandable rows out. Sites register a thin island in config
 * `entryListIslands`, map their TS data module through `slotItems`, and hand
 * the items to this component. Row bodies are the `@@@` slot bodies of the
 * build-time pipeline; nested islands inside a body are hydrated by the root
 * MutationObserver below (initial mount and every filter/sort rebuild alike).
 */
export function XList(props: XListProps): SolidElement {
  // Islands carry no locale prop: derive messages from the page language.
  const t = pageMessages();
  const uid = nextXListUid();

  const indexed = createMemo<IndexedItem[]>(() =>
    props.items.map((item, id) => {
      const bodyText =
        item.bodyHtml === undefined ? '' : htmlText(item.bodyHtml);
      const haystack =
        `${item.key}\n${item.title}\n${item.cells.map(cell => cell.text).join('\n')}\n${bodyText}\n${item.searchExtra ?? ''}`.toLowerCase();
      return { id, item, haystack };
    }),
  );

  const metaCount = () => Math.max(0, (props.columns?.length ?? 1) - 1);
  const inlineCount = () =>
    Math.min(props.inlineCount ?? 0, Math.max(0, metaCount()));
  const visibleMetaCount = () => metaCount() - inlineCount();

  const [query, setQuery] = createSignal('');
  const [sort, setSort] = createSignal<SortState | null>(null);
  const [open, setOpen] = createSignal<ReadonlySet<number>>(new Set());
  const [hiddenFilters, setHiddenFilters] = createSignal<ReadonlySet<string>>(
    new Set(),
  );

  const terms = createMemo(() =>
    query()
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term !== ''),
  );

  /** Visible meta columns that sort numerically (score columns); the rest
   * sort by natural cell-text order. */
  const numericCols = createMemo(() =>
    numericColumns(props.items, visibleMetaCount()),
  );

  /** Whether one column's first click sorts descending (score columns). */
  const isNumericCol = (col: SortState['col']): boolean =>
    col !== 'title' && numericCols().has(col);

  const cycleSort = (col: SortState['col']): void => {
    setSort(nextSortDir(sort(), col, isNumericCol(col)));
  };

  const filtered = createMemo(() => {
    const needle = terms();
    const searched =
      needle.length === 0
        ? indexed()
        : indexed().filter(entry =>
            needle.every(term => entry.haystack.includes(term)),
          );
    // Exclusion filters hide flagged rows before sorting; the count line
    // keeps showing visible / total (hidden rows stay accounted for).
    const hidden = hiddenFilters();
    const base =
      hidden.size === 0
        ? searched
        : searched.filter(
            entry =>
              !(entry.item.filterFlags ?? []).some(flag => hidden.has(flag)),
          );
    const state = sort();
    if (state === null) return base;
    const compare = itemComparator(state, numericCols(), props.sorters);
    return base.toSorted((x, y) => compare(x.item, y.item));
  });

  const collapsible = () => props.collapsible ?? true;
  const sortableSpec = () => resolveSortable(props.sortable);
  const showCount = () => props.showCount ?? true;
  const showHint = () => props.hint ?? true;
  const expandable = (entry: IndexedItem): boolean =>
    collapsible() && (entry.item.bodyHtml?.trim() ?? '') !== '';

  const isOpen = (id: number): boolean => open().has(id);
  const toggle = (id: number): void => {
    const next = new Set(open());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  const toggleFilter = (id: string, on: boolean): void => {
    const next = new Set(hiddenFilters());
    if (on) next.add(id);
    else next.delete(id);
    setHiddenFilters(next);
  };

  const hasExpandable = () => indexed().some(entry => expandable(entry));

  /** Split cells into table columns + title-inline content. */
  const cellsOf = (
    entry: IndexedItem,
  ): {
    visible: XListCell[];
    inline: XListCell[];
  } => {
    const cut = entry.item.cells.length - inlineCount();
    return {
      visible: entry.item.cells.slice(0, cut),
      inline: entry.item.cells.slice(cut),
    };
  };

  return (
    <div
      class="ap-xlist"
      ref={el => {
        // Slot bodies carry island placeholders. Solid applies dynamic
        // innerHTML in a scheduler flush after the ref fires, and solid 2
        // effects skip the initial run, so neither a ref microtask nor a
        // createEffect pass can time this; watch for the placeholders
        // actually appearing instead. hydrateIslands' mounted marker keeps
        // re-runs idempotent, so every mutation batch — initial mount,
        // filter/sort rebuilds, HMR — converges by itself.
        const mo = new MutationObserver(() => hydrateIslands(el));
        mo.observe(el, { childList: true, subtree: true });
        onCleanup(() => mo.disconnect());
      }}
    >
      <Show
        when={
          (props.searchable ?? true) ||
          (props.filters !== undefined && props.filters.length > 0) ||
          showCount()
        }
      >
        <div class="ap-xlist__toolbar">
          <Show when={props.searchable ?? true}>
            <input
              class="ap-xlist__search"
              type="search"
              placeholder={t.xlist.searchPlaceholder}
              aria-label={t.xlist.searchPlaceholder}
              value={query()}
              onInput={e => setQuery(e.currentTarget.value)}
            />
          </Show>
          <Show when={props.filters !== undefined && props.filters.length > 0}>
            <For each={props.filters}>
              {filter => (
                <label
                  class={cx(
                    'ap-xlist__filter',
                    hiddenFilters().has(filter.id) && 'is-active',
                  )}
                  title={filter.hint}
                >
                  <input
                    type="checkbox"
                    checked={hiddenFilters().has(filter.id)}
                    onChange={e =>
                      toggleFilter(filter.id, e.currentTarget.checked)
                    }
                  />
                  <span>{filter.label}</span>
                </label>
              )}
            </For>
          </Show>
          <Show when={showCount()}>
            <span class="ap-xlist__count" role="status">
              {formatMessage(t.xlist.count, {
                shown: filtered().length,
                total: indexed().length,
              })}
            </span>
          </Show>
        </div>
      </Show>
      <Show when={showHint() && collapsible() && hasExpandable()}>
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
              visibleMetaCount() >= 4 && 'ap-xlist__table--wide',
            )}
          >
            <colgroup>
              <col class="ap-xlist__col-title" />
              <For each={Array.from({ length: visibleMetaCount() })}>
                {() => <col class="ap-xlist__col-meta" />}
              </For>
            </colgroup>
            <Show when={props.columns}>
              <thead>
                <tr class="ap-xlist__head-row">
                  <SortHeader
                    title
                    label={props.columns?.[0] ?? ''}
                    sortable={sortableHeader(sortableSpec(), 'title')}
                    dir={columnSortDir(sort(), 'title')}
                    hint={t.xlist.sortToggle}
                    onToggle={() => cycleSort('title')}
                  />
                  <For
                    each={(props.columns ?? []).slice(
                      1,
                      1 + visibleMetaCount(),
                    )}
                  >
                    {(header, col) => (
                      <SortHeader
                        label={header}
                        sortable={sortableHeader(sortableSpec(), col())}
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
                {entry => {
                  const expandableRow = () => expandable(entry);
                  const { visible, inline } = cellsOf(entry);
                  const rowId = () => entry.id;
                  return (
                    <>
                      <tr
                        class={cx(
                          'ap-xlist__row',
                          expandableRow() && 'is-expandable',
                          entry.item.highlight && 'is-highlight',
                          isOpen(rowId()) && 'is-open',
                        )}
                        onClick={
                          expandableRow()
                            ? (e: MouseEvent) => {
                                if (
                                  e.target instanceof Element &&
                                  e.target.closest('a, button')
                                )
                                  return;
                                toggle(rowId());
                              }
                            : undefined
                        }
                      >
                        <td
                          class="ap-xlist__cell ap-xlist__title"
                          // Deep-link parity with the static h6 anchor, which
                          // hydration replaces.
                          id={entry.item.key}
                        >
                          <Show
                            // A title with interactive parts (link, fold)
                            // cannot sit inside the toggle button — keyboard
                            // users could never reach the link — so such rows
                            // render plain content; the parts own their
                            // clicks, the rest of the row still toggles.
                            when={
                              expandableRow() &&
                              !interactiveTitle(entry.item.titleParts)
                            }
                            fallback={
                              <span class="ap-xlist__title-text">
                                <TitleView item={entry.item} />
                              </span>
                            }
                          >
                            <button
                              type="button"
                              class="ap-xlist__toggle"
                              aria-expanded={isOpen(rowId()) ? 'true' : 'false'}
                              aria-controls={`${uid}-${rowId()}`}
                              onClick={() => toggle(rowId())}
                            >
                              <TitleView item={entry.item} />
                            </button>
                          </Show>
                          <Show when={inline.length > 0}>
                            <span class="ap-xlist__title-inline">
                              <PartsView
                                parts={inline.flatMap(cell => cell.parts)}
                              />
                            </span>
                          </Show>
                        </td>
                        <For each={visible}>
                          {cell => (
                            <td
                              class={cx(
                                'ap-xlist__cell ap-xlist__item-meta',
                                cell.emphasis && `is-${cell.emphasis}`,
                                cell.empty && 'is-empty',
                                cell.date && 'is-date',
                              )}
                            >
                              <PartsView parts={cell.parts} />
                            </td>
                          )}
                        </For>
                      </tr>
                      <RevealRow
                        id={`${uid}-${rowId()}`}
                        open={isOpen(rowId())}
                        colspan={visibleMetaCount() + 1}
                        html={entry.item.bodyHtml ?? ''}
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
