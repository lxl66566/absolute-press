import { createEffect, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import type { PagePayload } from '../../shared/types';
import { NEAR_ROOT_MARGIN, observeNearOnce } from '../dom';
import { useMessages } from '../theme/i18n';
import { gateUnlocked } from '../theme/state';
import { toGraphData } from './layout';

import './graph.css';

/**
 * Interactive article reference graph at the end of article pages. Solid
 * renders only the section shell; the canvas below is fully owned by d3
 * (see ./chart.ts) so the two renderers never touch the same DOM. d3 is
 * lazy-imported to keep the shared entry bundle lean, and the import plus
 * the initial settle ticks only run once the reader scrolls near the
 * article tail (observeNearOnce) — the graph sits below the body and is
 * usually never reached. The viewport keeps its CSS height the whole time,
 * so the deferred mount cannot shift the layout.
 *
 * Encrypted pages stay graph-less until the gate opens (L13): the related
 * graph maps this page's neighborhood, which leaks associations between
 * locked articles, so it renders nothing while `gateUnlocked` is false.
 */
export function RelatedGraph(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  const visible = () => props.payload.encrypted === undefined || gateUnlocked();
  let viewport!: HTMLDivElement;

  createEffect(
    () => visible(),
    shown => {
      if (!shown || !viewport) return;
      let disposed = false;
      let destroy: (() => void) | null = null;
      const stopObserving = observeNearOnce(viewport, NEAR_ROOT_MARGIN, () => {
        if (disposed) return;
        void (async () => {
          const { mountChart } = await import('./chart');
          if (disposed || !viewport) return;
          const handle = mountChart(viewport, toGraphData(props.payload), {
            base: props.payload.site.base,
            label: t.related.title,
          });
          destroy = handle.destroy;
        })().catch((e: unknown) => {
          console.error('[absolute-press] related graph failed', e);
        });
      });
      return () => {
        disposed = true;
        stopObserving();
        destroy?.();
      };
    },
  );

  return (
    <Show when={visible()}>
      <section class="ap-related-graph" aria-label={t.related.title}>
        <h2 class="ap-related-graph__title">{t.related.title}</h2>
        <div class="ap-related-graph__viewport" ref={viewport} />
      </section>
    </Show>
  );
}
