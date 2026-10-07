import { For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import type { PagePayload } from '../../shared/types';
import { MetaChip } from './ArticleCard';
import { formatDate } from './date';
import { FaIcon } from './FaIcon';
import { useMessages } from './i18n';
import { ClockIcon } from './icons';

/** Meta row under an article h1: icon, created/updated dates, category & tag chips. */
export function ArticleMeta(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  const page = () => props.payload.page;
  const created = () => formatDate(page().createdAt);
  // Same-day created/updated renders a single date (vuepress-theme-hope
  // parity); compare the formatted values, not the raw ISO strings.
  const updated = () => {
    const value = formatDate(page().updatedAt);
    return value !== null && value === created() ? null : value;
  };
  return (
    <div class="ap-article-meta mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--c-border)] pb-4 text-sm text-[var(--c-text-2)]">
      <Show when={page().frontmatter.icon}>
        {icon => (
          <FaIcon
            name={icon()}
            icons={props.payload.site.icons}
            class="self-center text-base"
          />
        )}
      </Show>
      <Show when={created()}>
        {d => (
          <span class="inline-flex items-center" title={t.article.createdAt}>
            <time datetime={d()}>{d()}</time>
          </span>
        )}
      </Show>
      <Show when={updated()}>
        {d => (
          <span
            class="inline-flex items-center gap-1.5"
            title={t.article.lastUpdated}
          >
            <ClockIcon class="size-4" />
            {t.article.lastUpdated}
            <time datetime={d()}>{d()}</time>
          </span>
        )}
      </Show>
      <Show when={(page().frontmatter.category?.length ?? 0) > 0}>
        <span class="inline-flex flex-wrap items-center gap-1.5">
          <For each={page().frontmatter.category ?? []}>
            {name => (
              <MetaChip site={props.payload.site} kind="category" name={name} />
            )}
          </For>
        </span>
      </Show>
      <Show when={(page().frontmatter.tag?.length ?? 0) > 0}>
        <span class="inline-flex flex-wrap items-center gap-1.5">
          <For each={page().frontmatter.tag ?? []}>
            {name => (
              <MetaChip site={props.payload.site} kind="tag" name={name} />
            )}
          </For>
        </span>
      </Show>
    </div>
  );
}
