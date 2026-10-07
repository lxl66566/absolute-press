import { createEffect } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { NEAR_ROOT_MARGIN, observeNearOnce } from '../dom';
import { theme } from '../theme/state';

/**
 * Giscus comment section (island name: `Giscus`). No heading by site UX
 * rule — the border already separates it from the article body.
 *
 * Auto-mounted by the build layer at the end of article pages (no manual
 * tag needed in markdown). The giscus client script (third-party) is only
 * injected once the section nears the viewport — readers who never scroll
 * to the comments never pay for the script or its iframe. Theme follows
 * html[data-theme] via the giscus setConfig postMessage protocol — the
 * iframe is never reloaded.
 */
export interface GiscusProps {
  childrenHtml?: string;
  repo?: string;
  repoId?: string;
  category?: string;
  categoryId?: string;
  /** giscus UI language, e.g. 'zh-CN'. */
  lang?: string;
}

const GISCUS_ORIGIN = 'https://giscus.app';

function giscusTheme(): string {
  return theme() === 'dark' ? 'transparent_dark' : 'light';
}

/** Post the current theme to the giscus iframe; no-op until it exists. */
function syncGiscusTheme(): void {
  document
    .querySelector<HTMLIFrameElement>('iframe.giscus-frame')
    ?.contentWindow?.postMessage(
      { giscus: { setConfig: { theme: giscusTheme() } } },
      GISCUS_ORIGIN,
    );
}

/** Capture-phase listener: iframe `load` does not bubble but still traverses
 * the capture phase, so a giscus frame coming up re-syncs its theme. */
function onFrameLoad(e: Event): void {
  if (
    e.target instanceof HTMLIFrameElement &&
    e.target.classList.contains('giscus-frame')
  ) {
    syncGiscusTheme();
  }
}

export function Giscus(props: GiscusProps): SolidElement {
  let containerRef: HTMLDivElement | undefined;

  // Mount effect: defer the script injection until near the viewport. The
  // script's data-theme is read at injection time, so a theme flip made
  // while the reader is still far above the comments is picked up for free.
  createEffect(
    () => 0,
    () => {
      const container = containerRef;
      if (!container) return undefined;
      let removeFrameListener: (() => void) | null = null;
      const stopObserving = observeNearOnce(container, NEAR_ROOT_MARGIN, () => {
        const script = document.createElement('script');
        script.src = `${GISCUS_ORIGIN}/client.js`;
        script.async = true;
        script.crossOrigin = 'anonymous';
        const data: Record<string, string> = {
          repo: props.repo ?? '',
          repoId: props.repoId ?? '',
          category: props.category ?? '',
          categoryId: props.categoryId ?? '',
          mapping: 'pathname',
          strict: '0',
          reactionsEnabled: '1',
          emitMetadata: '0',
          inputPosition: 'top',
          theme: giscusTheme(),
          lang: props.lang ?? 'zh-CN',
        };
        for (const [key, value] of Object.entries(data)) {
          script.dataset[key] = value;
        }
        container.append(script);
        // A theme flip before the iframe exists is lost: postMessage has
        // no target and the frame later comes up with the initial theme.
        window.addEventListener('load', onFrameLoad, true);
        removeFrameListener = () =>
          window.removeEventListener('load', onFrameLoad, true);
      });
      return () => {
        stopObserving();
        removeFrameListener?.();
      };
    },
  );

  // Keep the iframe theme in sync without reloading it. The initial run
  // happens before the iframe exists; data-theme on the script covers that.
  createEffect(
    () => giscusTheme(),
    () => syncGiscusTheme(),
  );

  return (
    <section class="mt-12 border-t border-[var(--c-border)] pt-6">
      {/* min-height keeps the pre-injection placeholder from collapsing to a
          bare border, bounding the layout shift when the iframe appears. */}
      <div ref={containerRef} class="min-h-48" />
    </section>
  );
}
