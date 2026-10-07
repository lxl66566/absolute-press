import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

// Same validator the build layer applies to the `columns` prop.
import { normalizeColumns } from '../../shared/columns';
import { hydrateIslands } from '../runtime/hydrate';
import { cx } from '../theme/cx';
import { formatMessage, pageMessages } from '../theme/i18n';
// Pure parse/cell logic lives in expandable-list-parse.ts (also imported by
// the unit tests); this file keeps the island's UI only.
import {
  cellSegments,
  inlineColumnIndexes,
  parseChildren,
  splitVisibleCells,
  visibleHeaders,
} from './expandable-list-parse';
import type { XListItem } from './expandable-list-parse';
import { flagOn } from './props';

import './ExpandableList.css';

/**
 * Expandable entry list (island name: `ExpandableList`).
 *
 * Build time splits the children markdown into titled entries (`@@@ Title`
 * delimiters, see src/node/markdown/entries.ts) and renders each entry as a
 * table row: title cell + one meta cell per `@@` column, followed by a
 * full-width row with the entry body. This component parses the static
 * table back into items (expandable-list-parse.ts) and adds search / sort /
 * expand-all / per-row toggles. Nested islands inside entries (e.g.
 * ZoomedImg) are re-hydrated whenever their item re-enters the rendered
 * list.
 */
export interface ExpandableListProps {
  childrenHtml?: string;
  /** Search box on by default; disable with `:searchable="false"`. */
  searchable?: boolean | string;
  /** Title sort control on by default; disable with `:sortable="false"`. */
  sortable?: boolean | string;
  /**
   * Column header labels: entry 0 names the title column, the rest name the
   * `@@` meta columns. Pass as JSON: `:columns='["游戏名", "时长"]'`.
   */
  columns?: unknown;
  /**
   * Meta columns rendered inline inside the title cell (after the title)
   * instead of as separate columns, e.g. `:inline='["标签", "备注"]'` for
   * legacy BookList-style rows where badges follow the title. Requires
   * `columns` (columns are matched by header label); unmatched names are
   * ignored. Only affects the hydrated table — the static fallback keeps all
   * columns.
   */
  inline?: unknown;
}

type SortMode = 'default' | 'title-asc' | 'title-desc';

const SORT_MODES: readonly SortMode[] = ['default', 'title-asc', 'title-desc'];

function isSortMode(value: string): value is SortMode {
  return (SORT_MODES as readonly string[]).includes(value);
}

/** Natural title order: base-insensitive, digit runs compared numerically. */
function compareTitles(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** An entry without body markdown cannot expand. */
function isExpandableRow(item: XListItem): boolean {
  return item.html.trim() !== '';
}

let seq = 0;

/** Render a cell's segments: plain HTML parts keep the build-time markup,
 * keyword parts become legacy-style pills. Segments run together with a
 * single space (the legacy layout: duration text then status badge). */
function SegmentsView(props: { html: string }): SolidElement {
  const segments = createMemo(() => cellSegments(props.html));
  return (
    <For each={segments()}>
      {(segment, index) => (
        <>
          <Show
            when={index() > 0 && segments()[index() - 1]?.badge === undefined}
          >
            {' '}
          </Show>
          <Show
            when={segment.badge}
            fallback={<span innerHTML={segment.html} />}
          >
            {badge => (
              <span class={`ap-xlist__badge ${badge().cls}`}>
                {badge().text}
              </span>
            )}
          </Show>
        </>
      )}
    </For>
  );
}

export function ExpandableList(props: ExpandableListProps): SolidElement {
  // Islands carry no locale prop: derive messages from the page language.
  const t = pageMessages();
  const uid = `ap-xlist-${++seq}`;
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
  const [sort, setSort] = createSignal<SortMode>('default');
  const [open, setOpen] = createSignal<ReadonlySet<number>>(new Set());

  const terms = createMemo(() =>
    query()
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term !== ''),
  );

  const filtered = createMemo(() => {
    const needle = terms();
    const base =
      needle.length === 0
        ? parsed.items
        : parsed.items.filter(item =>
            needle.every(term => item.haystack.includes(term)),
          );
    const mode = sort();
    if (mode === 'default') return base;
    return base.toSorted((a, b) =>
      mode === 'title-asc'
        ? compareTitles(a.title, b.title)
        : compareTitles(b.title, a.title),
    );
  });

  const isOpen = (id: number): boolean => open().has(id);
  const toggle = (id: number): void => {
    const next = new Set(open());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  // Statement-position calls: the Setter generic infers U from the contextual
  // return type, so expression-position calls against `(): void` arrows
  // resolve U to void and fail to typecheck.
  const expandAll = (): void => {
    setOpen(new Set(filtered().map(item => item.id)));
  };
  const collapseAll = (): void => {
    setOpen(new Set<number>());
  };

  const onSortChange = (value: string): void => {
    if (isSortMode(value)) setSort(value);
  };

  const hasExpandable = parsed.items.some(isExpandableRow);

  const metaHeaders = (): readonly string[] =>
    cols === undefined
      ? []
      : visibleHeaders(cols, inlineIndexes, visibleMetaCount);

  // Entries may embed islands (ZoomedImg, Mermaid, ...). Rows rebuilt by the
  // <For> (filter/sort re-entry) carry fresh placeholder markup; hydrate the
  // component root once the DOM settles. The runtime's mounted marker keeps
  // this idempotent and coordinates with the page-wide hydration pass.
  let rootRef: HTMLDivElement | undefined;
  createEffect(
    () =>
      filtered()
        .map(item => item.id)
        .join(','),
    () => {
      queueMicrotask(() => {
        if (rootRef) hydrateIslands(rootRef);
      });
    },
  );

  return (
    <div class="ap-xlist" ref={rootRef}>
      <Show when={parsed.preamble.trim() !== ''}>
        <div class="ap-xlist__preamble" innerHTML={parsed.preamble} />
      </Show>
      <div class="ap-xlist__toolbar">
        <Show when={flagOn(props.searchable, true)}>
          <input
            class="ap-xlist__search"
            type="search"
            placeholder={t.xlist.searchPlaceholder}
            aria-label={t.xlist.searchPlaceholder}
            value={query()}
            onInput={e => setQuery(e.currentTarget.value)}
          />
        </Show>
        <Show when={flagOn(props.sortable, true)}>
          <select
            class="ap-xlist__sort"
            aria-label={t.xlist.sortLabel}
            value={sort()}
            onChange={e => onSortChange(e.currentTarget.value)}
          >
            <option value="default">{t.xlist.sortDefault}</option>
            <option value="title-asc">{t.xlist.sortTitleAsc}</option>
            <option value="title-desc">{t.xlist.sortTitleDesc}</option>
          </select>
        </Show>
        <button type="button" class="ap-xlist__btn" onClick={expandAll}>
          {t.xlist.expandAll}
        </button>
        <button type="button" class="ap-xlist__btn" onClick={collapseAll}>
          {t.xlist.collapseAll}
        </button>
        <span class="ap-xlist__count" role="status">
          {formatMessage(t.xlist.count, {
            shown: filtered().length,
            total: parsed.items.length,
          })}
        </span>
      </div>
      <Show when={hasExpandable && parsed.items.length > 0}>
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
                  <th class="ap-xlist__th ap-xlist__th--title" scope="col">
                    {cols?.[0] ?? ''}
                  </th>
                  <For each={metaHeaders()}>
                    {header => (
                      <th class="ap-xlist__th" scope="col">
                        {header}
                      </th>
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
                          item.offer && 'is-offer',
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
                        <td class="ap-xlist__cell ap-xlist__title">
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
                              onClick={e => {
                                // Inline links keep native navigation;
                                // badges and text toggle the row. Images
                                // zoom (lightbox) without toggling.
                                if (
                                  e.target instanceof Element &&
                                  e.target.closest('a, button, img')
                                )
                                  e.stopPropagation();
                              }}
                            >
                              <SegmentsView html={inlineHtml} />
                            </span>
                          </Show>
                        </td>
                        <For each={cells}>
                          {cell => (
                            <td
                              class={cx(
                                'ap-xlist__cell ap-xlist__item-meta',
                                cell.score,
                                cell.empty && 'is-empty',
                                cell.date && 'is-date',
                              )}
                            >
                              <Show
                                when={cell.badged}
                                fallback={<span innerHTML={cell.html} />}
                              >
                                <SegmentsView html={cell.html} />
                              </Show>
                            </td>
                          )}
                        </For>
                      </tr>
                      <tr
                        class={cx(
                          'ap-xlist__reveal-row',
                          isOpen(item.id) && 'is-open',
                        )}
                      >
                        <td
                          class="ap-xlist__reveal-cell"
                          colspan={visibleMetaCount + 1}
                        >
                          <div
                            class={cx(
                              'ap-xlist__reveal ap-collapse',
                              !isOpen(item.id) && 'ap-collapsed',
                            )}
                            id={`${uid}-${item.id}`}
                          >
                            {/* Inner wrapper carries padding: a 0fr grid row
                                cannot compress it, and on `.ap-xlist__body`
                                it used to leak a sliver under collapsed rows. */}
                            <div class="ap-xlist__body">
                              <div
                                class="ap-xlist__body-inner"
                                innerHTML={item.html}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
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
