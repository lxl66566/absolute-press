import { createEffect, createSignal, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import type { PagePayload } from '../../shared/types';
import { registerDelegatedHost } from '../dom';
import { cx } from './cx';
import { useMessages } from './i18n';
import { ChevronDownIcon, ListIcon } from './icons';
import { TocOutline, useTocVisible } from './Toc';
import { buildTocTree } from './toc-tree';

import './InlineToc.css';

/**
 * Collapsed outline card for viewports too narrow for the fixed rail (the
 * rail #ap-toc only mounts visually at xl, 1280px+): a disclosure row under
 * the article meta ("below the date, top of the body") expanding the shared
 * outline body (TocOutline, spy + fold included). At xl the card hides via
 * CSS and the rail takes over.
 */
export function InlineToc(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  // Like Toc: the payload is fixed for the component's lifetime (the
  // content chrome remounts per client-side navigation) — build once.
  const tree = buildTocTree(props.payload.page.headings);
  const visible = useTocVisible(tree, props.payload);
  const [open, setOpen] = createSignal(false);
  // The host div is re-parented under the body h1 by ThemeContent's mount
  // effect, out of the #ap-chrome delegated container — without a container
  // of its own every onClick inside (toggle, toc rows, fold chevrons) is
  // dead. The registration travels with the nav element through the move.
  let navEl!: HTMLElement;
  createEffect(
    () => 0,
    () => registerDelegatedHost(navEl),
  );
  return (
    <Show when={visible()}>
      <nav
        ref={el => (navEl = el)}
        class="ap-toc-inline mb-6 overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-soft)]"
        aria-label={t.toc.title}
      >
        <button
          type="button"
          class="ap-toc-inline__toggle flex w-full items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-[var(--c-text)]"
          aria-expanded={open() ? 'true' : 'false'}
          aria-controls="ap-toc-inline-body"
          onClick={() => setOpen(v => !v)}
        >
          <ListIcon class="size-4 shrink-0 text-[var(--c-text-2)]" />
          <span class="flex-1 text-left">{t.toc.title}</span>
          <ChevronDownIcon
            class={cx(
              'size-4 shrink-0 text-[var(--c-text-2)] transition-transform duration-150 ease-out',
              !open() && '-rotate-90',
            )}
          />
        </button>
        <div
          id="ap-toc-inline-body"
          class={cx('ap-collapse', !open() && 'ap-collapsed')}
        >
          <div class="px-3 pt-1 pb-2">
            <TocOutline tree={tree} msg={t} rail={false} />
          </div>
        </div>
      </nav>
    </Show>
  );
}
