import { createEffect } from 'solid-js';

import type { IslandComponent } from '../runtime/hydrate';
import { theme } from '../theme/state';

/** Plot kinds supported by the G2Plot island (kebab of the export name). */
const KINDS = [
  'line',
  'area',
  'bar',
  'column',
  'pie',
  'scatter',
  'radar',
  'rose',
  'funnel',
  'histogram',
  'gauge',
  'liquid',
  'progress',
  'ring-progress',
  'bullet',
  'waterfall',
] as const;

export type G2PlotKind = (typeof KINDS)[number];

/** Chart config after merging island props; per-plot shape is G2Plot's. */
export type G2PlotConfig = Record<string, unknown>;

type G2Module = typeof import('@antv/g2plot');

interface PlotHandle {
  render: () => void;
  destroy: () => void;
}

type Factory = (
  g2: G2Module,
  container: HTMLElement,
  config: G2PlotConfig,
) => PlotHandle;

// JSON island props can't be statically checked against per-plot options;
// G2Plot validates them at runtime. The generic constructor keeps the
// boundary typed without `any`.
function createPlot<O>(
  Ctor: new (container: HTMLElement, options: O) => PlotHandle,
  container: HTMLElement,
  config: G2PlotConfig,
): PlotHandle {
  return new Ctor(container, config as O);
}

const factories: Record<G2PlotKind, Factory> = {
  line: (g2, el, c) => createPlot(g2.Line, el, c),
  area: (g2, el, c) => createPlot(g2.Area, el, c),
  bar: (g2, el, c) => createPlot(g2.Bar, el, c),
  column: (g2, el, c) => createPlot(g2.Column, el, c),
  pie: (g2, el, c) => createPlot(g2.Pie, el, c),
  scatter: (g2, el, c) => createPlot(g2.Scatter, el, c),
  radar: (g2, el, c) => createPlot(g2.Radar, el, c),
  rose: (g2, el, c) => createPlot(g2.Rose, el, c),
  funnel: (g2, el, c) => createPlot(g2.Funnel, el, c),
  histogram: (g2, el, c) => createPlot(g2.Histogram, el, c),
  gauge: (g2, el, c) => createPlot(g2.Gauge, el, c),
  liquid: (g2, el, c) => createPlot(g2.Liquid, el, c),
  progress: (g2, el, c) => createPlot(g2.Progress, el, c),
  'ring-progress': (g2, el, c) => createPlot(g2.RingProgress, el, c),
  bullet: (g2, el, c) => createPlot(g2.Bullet, el, c),
  waterfall: (g2, el, c) => createPlot(g2.Waterfall, el, c),
};

function isKind(value: unknown): value is G2PlotKind {
  return (
    typeof value === 'string' && (KINDS as readonly string[]).includes(value)
  );
}

/** Container hook for e2e/debug access to the live plot instance. */
type PlotHost = HTMLDivElement & { __apPlot?: PlotHandle | null };

/**
 * G2Plot island: `<G2Plot type="line" :data='[...]' :options='{...}' />`.
 * `data` and `options` merge into the plot constructor config (pass-through,
 * so native features like `slider` need no island support); the dark theme
 * re-renders the chart (G2Plot has no live theme switch). childrenHtml is
 * unused. The plot is destroyed on unmount.
 */
const G2Plot: IslandComponent = props => {
  const kind = isKind(props['type']) ? props['type'] : null;
  if (kind === null) {
    return (
      <div class="ap-g2plot--error">{`G2Plot: unknown type ${JSON.stringify(props['type'])}`}</div>
    );
  }
  const factory = factories[kind];
  const data: unknown = props['data'];
  const options =
    typeof props['options'] === 'object' && props['options'] !== null
      ? (props['options'] as Record<string, unknown>)
      : {};

  let container!: HTMLDivElement;

  createEffect(
    () => theme(),
    t => {
      let stale = false;
      let plot: PlotHandle | null = null;
      const config: G2PlotConfig = {
        data,
        ...options,
        ...(t === 'dark' ? { theme: 'dark' } : {}),
      };
      void import('@antv/g2plot')
        .then(g2 => {
          if (stale) return;
          plot = factory(g2, container, config);
          plot.render();
          (container as PlotHost).__apPlot = plot;
          return undefined;
        })
        .catch((e: unknown) => {
          console.error('[absolute-press] g2plot render failed', e);
        });
      return () => {
        stale = true;
        (container as PlotHost).__apPlot = null;
        plot?.destroy();
        plot = null;
      };
    },
  );

  return <div ref={container} class="ap-g2plot" />;
};

export default G2Plot;
