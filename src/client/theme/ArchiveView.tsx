import { createSignal, For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { ARCHIVE_PER_PAGE } from '../../shared/types';
import type { PagePayload } from '../../shared/types';
import { ArticleCard } from './ArticleCard';
import { formatMessage, useMessages } from './i18n';
import { parseArchiveRoute } from './links';
import { clampPage, pageCount, paginate } from './paginate';
import { Pagination } from './Pagination';

/**
 * Category/tag archive page. Kind and name derive from the route
 * (`/category/<name>`, `/tag/<name>`); cards reuse HomeFeed styles.
 */
export function ArchiveView(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  const info = () => parseArchiveRoute(props.payload.page.route);
  const articles = () => props.payload.articles ?? [];
  // The payload omits the default page size (see PagePayload.site).
  const perPage = () => props.payload.site.archivePerPage ?? ARCHIVE_PER_PAGE;
  const [page, setPage] = createSignal(1);
  const count = () => pageCount(articles().length, perPage());
  const current = () => paginate(articles(), page(), perPage());
  const goTo = (target: number): void => {
    setPage(clampPage(target, count()));
  };

  return (
    <Show when={info()} keyed>
      {i => (
        <section>
          <h1 class="mb-4 text-xl font-bold text-[var(--c-text)]">
            {formatMessage(
              i.kind === 'category'
                ? t.archive.categoryTitle
                : t.archive.tagTitle,
              { name: i.name },
            )}
          </h1>
          <Show
            when={articles().length > 0}
            fallback={
              <p class="py-10 text-center text-sm text-[var(--c-text-2)]">
                {t.archive.empty}
              </p>
            }
          >
            <ul class="ap-cards space-y-3">
              <For each={current()}>
                {article => (
                  <ArticleCard
                    article={article}
                    site={props.payload.site}
                    icons={props.payload.site.icons}
                  />
                )}
              </For>
            </ul>
            <Pagination
              page={page}
              count={count}
              onPage={goTo}
              site={() => props.payload.site}
            />
          </Show>
        </section>
      )}
    </Show>
  );
}
