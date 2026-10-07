import { createEffect } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import type { PagePayload } from '../../../shared/types';
import { cx } from '../cx';
import { useMessages } from '../i18n';
import { iconButtonClass } from './classes';

type AlgoliaConfig = NonNullable<PagePayload['site']['algolia']>;

/** Magnifier glyph, inline to keep icons.tsx untouched. */
function SearchGlyph(props: { class?: string }): SolidElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={props.class ?? 'size-5'}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/**
 * Algolia DocSearch trigger. @docsearch/js + css are lazy-loaded on first
 * hover/focus/click; the lib renders into a hidden container and our styled
 * trigger forwards clicks to its own button (which owns the modal). The lib
 * only registers its Ctrl/Cmd+K hotkey once rendered, so a document-level
 * listener bootstraps it before that and stands down afterwards.
 */
export function SearchBox(props: {
  algolia: AlgoliaConfig;
  site: PagePayload['site'];
}): SolidElement {
  const t = useMessages(() => props.site);
  let containerRef: HTMLSpanElement | undefined;
  let loading: Promise<void> | null = null;

  const ensureDocSearch = (): Promise<void> => {
    loading ??= (async () => {
      const [{ default: docsearch }] = await Promise.all([
        import('@docsearch/js/docsearch'),
        import('@docsearch/css/dist/style.css'),
        import('../docsearch.css'),
      ]);
      if (!containerRef) return;
      docsearch({
        appId: props.algolia.appId,
        apiKey: props.algolia.apiKey,
        indices: [props.algolia.indexName],
        container: containerRef,
        placeholder: t.search.placeholder,
      });
    })();
    return loading;
  };

  const open = (): void => {
    void (async () => {
      await ensureDocSearch();
      // preact mounts on a microtask; defer the synthetic click a frame.
      requestAnimationFrame(() => {
        containerRef
          ?.querySelector<HTMLButtonElement>('.DocSearch-Button')
          ?.click();
      });
    })();
  };
  const prefetch = (): void => {
    void ensureDocSearch();
  };

  // Global Ctrl/Cmd+K. Before the lazy lib renders, nothing owns the hotkey
  // (the kbd hint is always visible), so this opens — and lazy-loads — it.
  // After that the button exists and the lib's own window hotkey toggles
  // open/close; firing open() here too would double-handle one keypress.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key.toLowerCase() !== 'k' || (!e.ctrlKey && !e.metaKey)) return;
    e.preventDefault();
    if (containerRef?.querySelector('.DocSearch-Button')) return;
    open();
  };
  createEffect(
    () => 0,
    () => {
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    },
  );

  return (
    <>
      <button
        type="button"
        class="hidden h-9 w-52 items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-soft)] px-3 text-sm text-[var(--c-text-2)] transition duration-150 ease-out hover:border-[var(--c-accent)] hover:text-[var(--c-text)] xl:flex"
        onClick={open}
        onMouseEnter={prefetch}
        onFocus={prefetch}
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
        onClick={open}
        onMouseEnter={prefetch}
        onFocus={prefetch}
      >
        <SearchGlyph class="size-5" />
      </button>
      <span ref={containerRef} class="hidden" />
    </>
  );
}
