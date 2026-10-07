import { createEffect } from 'solid-js';

import type { IslandComponent } from '../runtime/hydrate';
import { pageMessages } from '../theme/i18n';
import { theme } from '../theme/state';
import type { PanZoomHandle } from './mermaid-pan-zoom';

import './Mermaid.css';

let seq = 0;

/** Plain-text chart source from pre-rendered placeholder HTML. */
function textFromHtml(html: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content.textContent ?? '';
}

/**
 * Mermaid island. The chart source comes from the `chart` prop (string) or,
 * when absent, from the placeholder's pre-rendered text (childrenHtml). The
 * runtime also upgrades ```mermaid code fences into this island (see
 * theme/mount.tsx). The rendered svg gets a pan/zoom shell (d3-zoom, lazy
 * chunk): Ctrl/Cmd+wheel or pinch zooms, drag pans, double-click or the
 * corner button resets — plain wheel/touch keeps scrolling the page.
 * Re-renders when the light/dark theme flips.
 */
const Mermaid: IslandComponent = props => {
  const fromProp = props['chart'];
  const chart =
    typeof fromProp === 'string'
      ? fromProp
      : typeof props.childrenHtml === 'string'
        ? textFromHtml(props.childrenHtml).trim()
        : '';
  const t = pageMessages();

  let canvas!: HTMLDivElement;
  let inner!: HTMLDivElement;
  let panZoom: PanZoomHandle | null = null;

  createEffect(
    () => theme(),
    mode => {
      let stale = false;
      const id = `ap-mermaid-${++seq}`;
      void (async () => {
        // Load d3 only with the chart: keeps it out of the entry bundle.
        const [{ default: mermaid }, { mountPanZoom }] = await Promise.all([
          import('mermaid'),
          import('./mermaid-pan-zoom'),
        ]);
        mermaid.initialize({
          startOnLoad: false,
          theme: mode === 'dark' ? 'dark' : 'default',
        });
        const { svg } = await mermaid.render(id, chart);
        if (stale) return;
        canvas.classList.remove('ap-mermaid--error');
        inner.innerHTML = svg;
        panZoom?.destroy();
        panZoom = mountPanZoom(canvas, inner);
      })().catch((e: unknown) => {
        console.error('[absolute-press] mermaid render failed', e);
        // mermaid may leave a temp error element in the body.
        document.getElementById(`d${id}`)?.remove();
        if (!stale) {
          inner.textContent =
            e instanceof Error ? e.message : 'mermaid render failed';
          canvas.classList.add('ap-mermaid--error');
        }
      });
      return () => {
        stale = true;
        panZoom?.destroy();
        panZoom = null;
      };
    },
  );

  return (
    <div class="ap-mermaid">
      <div class="ap-mermaid__canvas" ref={canvas} title={t.mermaid.zoomHint}>
        <div class="ap-mermaid__inner" ref={inner} />
      </div>
      <button
        type="button"
        class="ap-mermaid__reset"
        aria-label={t.mermaid.resetZoom}
        title={t.mermaid.resetZoom}
        onClick={() => panZoom?.reset()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
      </button>
    </div>
  );
};

export default Mermaid;
