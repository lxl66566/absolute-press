import { For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import type { ArticleInfo, PagePayload } from '../../shared/types';
import { cx } from './cx';
import { formatDate } from './date';
import { FaIcon } from './FaIcon';
import { FolderIcon, TagIcon } from './icons';
import { archiveHref, localePrefixOf, withBase } from './links';

/** Category/tag chip linking to its archive page. */
export function MetaChip(props: {
  /** Payload site block; supplies the relative base and the locale prefix. */
  site: PagePayload['site'];
  kind: 'category' | 'tag';
  name: string;
}): SolidElement {
  return (
    <a
      href={archiveHref(
        props.site.base,
        localePrefixOf(props.site),
        props.kind,
        props.name,
      )}
      class={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs transition duration-150 ease-out',
        props.kind === 'category'
          ? 'bg-[var(--c-bg-mute)] text-[var(--c-text)] hover:bg-[color-mix(in_srgb,var(--c-accent)_25%,var(--c-bg-mute))]'
          : 'border border-[var(--c-border)] text-[var(--c-text-2)] hover:border-[var(--c-accent)] hover:text-[var(--c-accent)]',
      )}
    >
      {props.kind === 'category' ? (
        <FolderIcon class="size-3.5" />
      ) : (
        <TagIcon class="size-3.5" />
      )}
      {props.name}
    </a>
  );
}

/**
 * Article card shared by HomeFeed and ArchiveView.
 * Note: ArticleInfo has no excerpt field, so cards show
 * icon/title/date plus category & tag chips.
 */
export function ArticleCard(props: {
  article: ArticleInfo;
  /** Payload site block; supplies the relative base and the locale prefix. */
  site: PagePayload['site'];
  /** Site icons map (payload `site.icons`); the icon key resolves here. */
  icons?: Record<string, string>;
}): SolidElement {
  const date = () => formatDate(props.article.createdAt);
  // Chip renders only when the key maps to a registered icon: a raw key like
  // "solid/box" printed as text is worse than no chip (FaIcon itself also
  // degrades to nothing on unparseable svg markup).
  const resolvedIcon = (): string | undefined => {
    const key = props.article.icon;
    return key !== undefined && props.icons?.[key] !== undefined
      ? key
      : undefined;
  };
  return (
    <li class="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4 transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--c-accent)_50%,var(--c-border))] hover:shadow-[var(--c-shadow)]">
      {/* items-center: baseline alignment lifts the boxed chip above the
          title midline; center it instead. */}
      <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Show when={resolvedIcon()}>
          {key => (
            <span class="rounded bg-[var(--c-bg-mute)] px-1.5 py-1 text-base leading-none text-[var(--c-text-2)]">
              <FaIcon name={key()} icons={props.icons} />
            </span>
          )}
        </Show>
        <a
          href={withBase(props.site.base, props.article.route)}
          class="text-base font-semibold text-[var(--c-text)] transition duration-150 ease-out hover:text-[var(--c-accent)]"
        >
          {props.article.title}
        </a>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--c-text-2)]">
        <Show when={date()}>{d => <time datetime={d()}>{d()}</time>}</Show>
        <For each={props.article.category}>
          {name => <MetaChip site={props.site} kind="category" name={name} />}
        </For>
        <For each={props.article.tag}>
          {name => <MetaChip site={props.site} kind="tag" name={name} />}
        </For>
      </div>
    </li>
  );
}
