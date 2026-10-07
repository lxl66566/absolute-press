import { For, Show } from 'solid-js';
import type { Accessor, Element as SolidElement } from 'solid-js';

import type { PagePayload } from '../../shared/types';
import { cx } from './cx';
import { formatMessage, useMessages } from './i18n';
import { pageItems } from './paginate';

const buttonClass =
  'min-w-8 rounded-md px-2 py-1 text-sm text-[var(--c-text-2)] transition duration-150 ease-out hover:bg-[var(--c-bg-soft)] hover:text-[var(--c-text)] disabled:pointer-events-none disabled:opacity-40';

export function Pagination(props: {
  page: Accessor<number>;
  count: Accessor<number>;
  onPage: (page: number) => void;
  site: Accessor<PagePayload['site']>;
}): SolidElement {
  const t = useMessages(props.site);
  return (
    <Show when={props.count() > 1}>
      <nav class="mt-6 flex items-center justify-center gap-1">
        <button
          type="button"
          class={buttonClass}
          disabled={props.page() <= 1}
          onClick={() => props.onPage(props.page() - 1)}
        >
          {t.pagination.prev}
        </button>
        <For each={pageItems(props.page(), props.count())}>
          {item =>
            item === 'gap' ? (
              <span class="px-1 text-[var(--c-text-2)]">…</span>
            ) : (
              <button
                type="button"
                class={cx(
                  buttonClass,
                  item === props.page() &&
                    'bg-[var(--c-bg-mute)] font-medium text-[var(--c-accent)]',
                )}
                aria-current={item === props.page() ? 'page' : undefined}
                aria-label={formatMessage(t.pagination.pageLabel, { n: item })}
                onClick={() => props.onPage(item)}
              >
                {item}
              </button>
            )
          }
        </For>
        <button
          type="button"
          class={buttonClass}
          disabled={props.page() >= props.count()}
          onClick={() => props.onPage(props.page() + 1)}
        >
          {t.pagination.next}
        </button>
      </nav>
    </Show>
  );
}
