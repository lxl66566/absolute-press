import type MiniSearch from 'minisearch';
import { createEffect, createSignal, For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { withBase } from '../../../shared/links';
import { searchTokens } from '../../../shared/search';
import type { PagePayload, SiteSearch } from '../../../shared/types';
import { cx } from '../cx';
import { useMessages } from '../i18n';
import { clientBase } from '../state';
import { iconButtonClass } from './classes';
import { SearchGlyph } from './SearchGlyph';

import './LocalSearch.css';

/** One rendered result row (the snippet keeps <mark> spans for the terms). */
interface Hit {
  href: string;
  title: string;
  heading: string;
  /** Snippet with matched-term runs wrapped in <mark>; null when absent. */
  snippet: string | null;
}

/** Result cap: a longer list only slows rendering; DocSearch caps at 20+. */
const MAX_RESULTS = 20;
/** Snippet length around the first matched term (chars each side). */
const SNIPPET_RADIUS = 36;

/**
 * Local offline search: the trigger lazy-loads the locale's doc module and
 * builds a MiniSearch index on first open (a visitor who never opens the
 * box downloads nothing search-related). Queries run client-side; CJK text
 * tokenizes into overlapping bigrams (shared/search.ts), the same tokenizer
 * on the index and query side so the vocabularies cannot drift. Results
 * filter to the page's locale, deep-link heading anchors, and the snippet
 * highlights matched terms. Ctrl/Cmd+K opens the box.
 */
export function LocalSearch(props: {
  search: Extract<SiteSearch, { kind: 'local' }>;
  site: PagePayload['site'];
}): SolidElement {
  const t = useMessages(() => props.site);
  // One module-level cache entry: every page's navbar shares one index per
  // document, and soft navigation across locales swaps it (ensureIndex).
  const warm = (): Promise<void> => ensureIndex(indexHref(props.search.index));
  const [query, setQuery] = createSignal('');
  const [open, setOpen] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;

  const openBox = (): void => {
    setOpen(true);
    // Focus lands after the panel mounts (Show renders synchronously).
    queueMicrotask(() => inputRef?.focus());
    // Warm the index on first open: a visitor about to type meets a ready
    // index instead of racing their first query against the download.
    void warm();
  };

  // Ctrl/Cmd+K opens the box from anywhere on the page.
  const onHotkey = (e: KeyboardEvent): void => {
    if (e.key.toLowerCase() !== 'k' || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    openBox();
  };

  createEffect(
    () => 0,
    () => {
      document.addEventListener('keydown', onHotkey);
      return () => document.removeEventListener('keydown', onHotkey);
    },
  );

  const hits = (): Hit[] => {
    const q = query().trim();
    if (q === '' || index === null) return [];
    const raw = index.search(searchTokens(q).join(' '), {
      fuzzy: 0.2,
      prefix: true,
      boost: { title: 3, heading: 2 },
    });
    const out: Hit[] = [];
    for (const r of raw) {
      if (r.terms.length === 0) continue;
      const doc = docsById.get(r.id);
      if (doc === undefined || doc.locale !== props.site.locale) continue;
      if (out.length >= MAX_RESULTS) break;
      out.push({
        href: withBase(
          clientBase(),
          `${doc.route}${doc.anchor === '' ? '' : `#${doc.anchor}`}`,
        ),
        title: doc.title,
        heading: doc.heading,
        snippet: snippetOf(doc.text, r.terms),
      });
    }
    return out;
  };

  // Escape closes and returns focus to the trigger; the veil handles
  // click-outside.
  const onPanelKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setOpen(false);
      triggerRef?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class="hidden h-9 w-52 items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-soft)] px-3 text-sm text-[var(--c-text-2)] transition duration-150 ease-out hover:border-[var(--c-accent)] hover:text-[var(--c-text)] xl:flex"
        onClick={openBox}
        onMouseEnter={() => void warm()}
        onFocus={() => void warm()}
      >
        <SearchGlyph class="size-4" />
        <span class="flex-1 truncate text-left">{t.search.placeholder}</span>
        <kbd class="rounded border border-[var(--c-border)] bg-[var(--c-bg)] px-1.5 py-0.5 text-xs">
          Ctrl K
        </kbd>
      </button>
      <button
        type="button"
        class={cx(iconButtonClass, 'xl:hidden')}
        aria-label={t.search.label}
        onClick={openBox}
        onMouseEnter={() => void warm()}
      >
        <SearchGlyph class="size-5" />
      </button>
      <Show when={open()}>
        <div class="ap-local-search__veil" onClick={() => setOpen(false)} />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.search.label}
          class="ap-local-search ap-local-search__panel fixed top-[10vh] left-1/2 flex max-h-[80vh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] shadow-lg"
          onKeyDown={onPanelKeyDown}
        >
          <div class="flex items-center gap-2 border-b border-[var(--c-border)] px-4 py-3">
            <SearchGlyph class="size-4 shrink-0 text-[var(--c-text-2)]" />
            <input
              ref={inputRef}
              type="search"
              class="h-7 flex-1 bg-transparent text-sm text-[var(--c-text)] outline-none placeholder:text-[var(--c-text-2)]"
              placeholder={t.search.placeholder}
              value={query()}
              onInput={e => setQuery(e.currentTarget.value)}
              autocomplete="off"
              spellcheck={false}
            />
          </div>
          <ul class="ap-local-search__results flex-1 overflow-y-auto p-2">
            <For each={hits()}>
              {hit => (
                <li>
                  <a
                    href={hit.href}
                    class="block rounded-lg px-3 py-2 transition duration-150 ease-out hover:bg-[var(--c-bg-soft)]"
                    onClick={() => setOpen(false)}
                  >
                    <span class="block truncate text-sm font-medium text-[var(--c-text)]">
                      {hit.title}
                      <Show when={hit.heading !== ''}>
                        <span class="font-normal text-[var(--c-text-2)]">
                          {' '}
                          › {hit.heading}
                        </span>
                      </Show>
                    </span>
                    <Show when={hit.snippet} keyed>
                      {snippet => (
                        <span
                          class="mt-0.5 block truncate text-xs text-[var(--c-text-2)]"
                          innerHTML={snippet}
                        />
                      )}
                    </Show>
                  </a>
                </li>
              )}
            </For>
            <Show when={query().trim() !== '' && hits().length === 0}>
              <li class="px-3 py-6 text-center text-sm text-[var(--c-text-2)]">
                {t.search.noResults}
              </li>
            </Show>
          </ul>
        </div>
      </Show>
    </>
  );
}

// -- Module-level index state ----------------------------------------------

/** Doc shape of the index asset (shared/search.ts SearchDoc). */
interface SearchDocShape {
  id: string;
  route: string;
  locale: string;
  title: string;
  heading: string;
  anchor: string;
  text: string;
}

let indexUrl: string | null = null;
let indexPromise: Promise<void> | null = null;
let index: MiniSearch<SearchDocShape> | null = null;
const docsById = new Map<string, SearchDocShape>();

/** Page-relative index reference joined onto the live base. */
function indexHref(ref: string): string {
  return withBase(clientBase(), ref);
}

/** Load (once per URL) the doc module a payload references and index it. */
async function loadIndex(url: string): Promise<void> {
  try {
    const [mod, ms] = await Promise.all([
      import(/* @vite-ignore */ url) as Promise<{
        default: { docs: SearchDocShape[] };
      }>,
      import('minisearch'),
    ]);
    const mini = new ms.default<SearchDocShape>({
      fields: ['title', 'heading', 'text'],
      storeFields: ['id', 'route', 'locale', 'title', 'heading', 'anchor'],
      tokenize: searchTokens,
      processTerm: (term: string) => (term.length > 24 ? '' : term),
    });
    mini.addAll(mod.default.docs);
    docsById.clear();
    for (const doc of mod.default.docs) docsById.set(doc.id, doc);
    index = mini;
  } catch (e) {
    console.error('[absolute-press] failed to load search index', url, e);
  }
}

/**
 * Ensure the shared index entry matches the wanted URL: the first caller
 * starts the load; a soft navigation across locales swaps the entry (the
 * previous locale's index must never answer the new page's queries).
 */
function ensureIndex(url: string): Promise<void> {
  if (indexUrl !== url) {
    indexUrl = url;
    index = null;
    docsById.clear();
    indexPromise = loadIndex(url);
  }
  // The assignment branch above always ran on the first call, so this only
  // satisfies the type of the fall-through.
  return indexPromise ?? Promise.resolve();
}

/**
 * Snippet around the first matched term with every query-term occurrence in
 * the window wrapped in <mark> (styled in LocalSearch.css).
 */
function snippetOf(text: string, terms: readonly string[]): string | null {
  const lower = text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const i = lower.indexOf(term.toLowerCase());
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return null;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(text.length, at + SNIPPET_RADIUS);
  const window = text.slice(start, end);
  // Mark matched runs inside the window; longest terms first so overlapping
  // short terms cannot shred a longer match.
  const sorted = [...terms].toSorted((a, b) => b.length - a.length);
  const pattern = new RegExp(sorted.map(escapeRe).join('|'), 'gi');
  const marked = window.replace(pattern, m => `<mark>${m}</mark>`);
  return `${start > 0 ? '…' : ''}${marked}${end < text.length ? '…' : ''}`;
}

/** Regex-escape a literal term for the snippet marker. */
function escapeRe(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
