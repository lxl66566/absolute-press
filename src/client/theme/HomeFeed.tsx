import { createSignal, For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { HOME_FEED_PER_PAGE } from '../../shared/types';
import type { PagePayload } from '../../shared/types';
import { ArticleCard } from './ArticleCard';
import { cx } from './cx';
import { useMessages } from './i18n';
import { clampPage, pageCount, paginate } from './paginate';
import { Pagination } from './Pagination';

/** Home article feed: client-side pagination over payload.articles. */
export function HomeFeed(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  const articles = () => props.payload.articles ?? [];
  // The payload omits the default page size (see PagePayload.site).
  const perPage = () => props.payload.site.feedPerPage ?? HOME_FEED_PER_PAGE;
  const [page, setPage] = createSignal(1);
  const count = () => pageCount(articles().length, perPage());
  const current = () => paginate(articles(), page(), perPage());
  // Drives the quick fade-in on page change (re-added after two frames).
  const [anim, setAnim] = createSignal(true);

  const goTo = (target: number): void => {
    const next = clampPage(target, count());
    if (next === page()) return;
    setPage(next);
    setAnim(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setAnim(true);
      }),
    );
  };

  return (
    <section>
      <Show
        when={articles().length > 0}
        fallback={
          <p class="py-10 text-center text-sm text-[var(--c-text-2)]">
            {t.feed.empty}
          </p>
        }
      >
        <ul class={cx('ap-cards space-y-3', anim() && 'ap-feed-anim')}>
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
  );
}
