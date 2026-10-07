import { drag as d3drag } from 'd3-drag';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';

import { nearView } from '../dom';
import { navigateTo } from '../runtime/router';
import { withBase } from '../theme/links';
import {
  adjacencyMap,
  defaultLabelSet,
  edgeOpacity,
  edgeWidth,
  endpointOf,
  fitTransform,
  graphLabel,
  LABEL_ZOOM_FACTOR,
  nodeExtent,
  type GraphData,
  type GraphEdge,
  type GraphNode,
} from './layout';
import { simPower } from './power';

export interface ChartOptions {
  /** Per-page relative base prefix, used for node click navigation. */
  base: string;
  /** Localized accessible name of the canvas. */
  label: string;
}

export interface ChartHandle {
  destroy(): void;
}

// Force model, tuned for blog-scale graphs (a handful up to ~170 nodes):
// weak charge with a distance cap keeps ticks cheap, collide reserves room
// for labels, and a high velocityDecay damps the perpetual Brownian drift
// so the layout breathes without ever diverging. Distances are sized for
// the compact presentation (9px labels, 4px dots).
const LINK_DISTANCE = 64;
const CHARGE = -75;
const CHARGE_MAX = 270;
const COLLIDE = 10;
const VELOCITY_DECAY = 0.4;
/** Random velocity kick per tick, in viewBox units. */
const JITTER = 0.06;
/** Never-decaying alpha floor: keeps the simulation alive at low energy. */
const BROWNIAN_ALPHA = 0.03;
const DRAG_ALPHA = 0.25;
/** Manual pre-settle ticks before the initial fit is computed. */
const SETTLE_TICKS = 120;
/** Wheel / touch zoom bounds. */
const SCALE_MIN = 0.5;
const SCALE_MAX = 4;
/** Click vs drag slop, in screen px. */
const CLICK_SLOP = 4;

/**
 * Imperative d3 chart inside `container`: d3 owns everything below the
 * container (svg, nodes, edges), Solid only provides the shell and the
 * lifecycle, so the two renderers never fight over the same DOM.
 */
export function mountChart(
  container: HTMLElement,
  data: GraphData,
  opts: ChartOptions,
): ChartHandle {
  // Read once at mount; a mid-session media flip just keeps static behavior.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rect = container.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width) || 640);
  const height = Math.max(240, Math.round(rect.height) || 360);
  const cx = width / 2;
  const cy = height / 2;

  // Deterministic initial layout: the article dot pinned at center, its
  // neighbors on a golden-angle spiral (even spread, no randomness).
  data.nodes.forEach((n, i) => {
    if (n.current) {
      n.x = cx;
      n.y = cy;
      n.fx = cx;
      n.fy = cy;
      return;
    }
    const angle = i * 2.399963;
    const radius = 26 + 9 * Math.sqrt(i);
    n.x = cx + radius * Math.cos(angle);
    n.y = cy + radius * Math.sin(angle);
  });

  const svg = select(container)
    .append('svg')
    .attr('class', 'ap-graph-svg')
    .attr('viewBox', [0, 0, width, height].join(' '))
    .attr('role', 'group')
    .attr('aria-label', opts.label);

  // Degree map for the link-strength normalization below.
  const degree = new Map<string, number>();
  for (const e of data.edges) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }

  // Default visible-label set (M9): the current article plus its one-hop
  // neighbors. Two-hop members stay dot-only until hover or zoom-in, so a
  // hub canvas never prints its whole neighborhood at once.
  const adj = adjacencyMap(data.edges);
  const currentId = data.nodes.find(n => n.current)?.id ?? '';
  const baseLabels = defaultLabelSet(currentId, data.edges);

  const root = svg.append('g').attr('class', 'ap-graph-root');

  const edgeSel = root
    .append('g')
    .attr('class', 'ap-graph-edges')
    .selectAll<SVGLineElement, GraphEdge>('line')
    .data(data.edges)
    .join('line')
    .attr('class', 'ap-graph-edge')
    // Presentation attributes: the .is-dim/.is-active CSS classes win over
    // these, which is what makes hover dimming work without inline styles.
    .attr('stroke-width', d => edgeWidth(d.refs))
    .attr('opacity', d => edgeOpacity(d.refs));

  const nodeSel = root
    .append('g')
    .attr('class', 'ap-graph-nodes')
    .selectAll<SVGGElement, GraphNode>('g')
    .data(data.nodes)
    .join('g')
    .attr(
      'class',
      d =>
        `ap-graph-node${d.current ? ' is-current' : ''}${
          baseLabels.has(d.id) ? ' is-near' : ''
        }`,
    )
    .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeSel
    .append('circle')
    .attr('r', d => d.r)
    .append('title')
    .text(d => d.title);
  const labelSel = nodeSel
    .append('text')
    .attr('class', 'ap-graph-label')
    .attr('x', d => d.r + 5)
    .attr('y', 3.5)
    .text(d => graphLabel(d.title));

  const render = (): void => {
    nodeSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    // Label avoidance (M9): dots left of the canvas midline anchor their
    // label on the left so hub rings read outward instead of overprinting
    // the center. Positions barely drift after the settle, so the flip is
    // stable in the default state.
    labelSel
      .attr('text-anchor', d => ((d.x ?? cx) < cx ? 'end' : 'start'))
      .attr('x', d => ((d.x ?? cx) < cx ? -(d.r + 5) : d.r + 5));
    edgeSel
      .attr('x1', d => endpointOf(d.source)?.x ?? 0)
      .attr('y1', d => endpointOf(d.source)?.y ?? 0)
      .attr('x2', d => endpointOf(d.target)?.x ?? 0)
      .attr('y2', d => endpointOf(d.target)?.y ?? 0);
  };

  // Hover: light up the touched node's edges, dim everything unrelated, and
  // extend the visible labels to the hovered node's neighborhood. On leave
  // the label set falls back to the default one-hop ring.
  const setHover = (id: string | null): void => {
    edgeSel
      .classed(
        'is-active',
        d => id !== null && (d.sourceId === id || d.targetId === id),
      )
      .classed(
        'is-dim',
        d => id !== null && d.sourceId !== id && d.targetId !== id,
      );
    nodeSel.classed(
      'is-dim',
      d => id !== null && d.id !== id && !adj.get(id)?.has(d.id),
    );
    nodeSel.classed(
      'is-near',
      d =>
        baseLabels.has(d.id) ||
        (id !== null && (d.id === id || (adj.get(id)?.has(d.id) ?? false))),
    );
  };
  nodeSel
    .on('mouseenter', (_event, d) => setHover(d.id))
    .on('mouseleave', () => setHover(null));

  // Wheel / touch zoom + background pan; d3-drag stops propagation on
  // nodes, so dragging a dot never zooms the canvas underneath.
  let currentK = 1;
  // Relative label threshold: at the entry fit only the one-hop ring is
  // labeled (M9); zooming in past it reveals every label.
  let labelZoomK = LABEL_ZOOM_FACTOR;
  const zoomBehavior = d3zoom<SVGSVGElement, unknown>()
    .scaleExtent([SCALE_MIN, SCALE_MAX])
    .on('zoom', event => {
      root.attr('transform', event.transform.toString());
      currentK = event.transform.k;
      // All labels appear once the reader leans in (the one-hop ring and
      // the article dot always show their labels through CSS).
      svg.classed('is-labels-visible', currentK >= labelZoomK);
    });
  svg.call(zoomBehavior).on('dblclick.zoom', null);

  const deg = (v: string | number | GraphNode): number =>
    degree.get(typeof v === 'object' ? v.id : String(v)) ?? 1;

  const sim: Simulation<GraphNode, GraphEdge> = forceSimulation<GraphNode>(
    data.nodes,
  )
    .force(
      'link',
      forceLink<GraphNode, GraphEdge>(data.edges)
        .id(d => d.id)
        .distance(LINK_DISTANCE)
        // Standard degree normalization: hub edges pull less, so dense
        // clusters keep their shape instead of collapsing.
        .strength(l => 1 / Math.min(deg(l.source), deg(l.target))),
    )
    .force(
      'charge',
      forceManyBody<GraphNode>().strength(CHARGE).distanceMax(CHARGE_MAX),
    )
    .force('collide', forceCollide<GraphNode>(COLLIDE))
    .force('x', forceX<GraphNode>(cx).strength(0.04))
    .force('y', forceY<GraphNode>(cy).strength(0.05))
    .velocityDecay(VELOCITY_DECAY);

  const ticked = (): void => {
    // Brownian life: tiny random kicks on free nodes; fixed nodes (the
    // article dot, a dot being dragged) are never kicked.
    for (const d of data.nodes) {
      if (d.fx === undefined || d.fx === null)
        d.vx = (d.vx ?? 0) + (Math.random() - 0.5) * JITTER;
      if (d.fy === undefined || d.fy === null)
        d.vy = (d.vy ?? 0) + (Math.random() - 0.5) * JITTER;
    }
    render();
  };

  // Node drag: pin while dragging (event.x/y are graph coordinates even
  // under zoom, via the drag container's screen CTM), release springs back.
  let dragOrigin: [number, number] | null = null;
  // Set once a gesture moved past the slop; swallows the trailing click so
  // dragging a dot does not navigate.
  let suppressClick = false;
  const dragBehavior = d3drag<SVGGElement, GraphNode, undefined>()
    .on('start', (event, d) => {
      dragOrigin = [event.x, event.y];
      suppressClick = false;
      if (!reduced) sim.alphaTarget(DRAG_ALPHA).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
      d.x = event.x;
      d.y = event.y;
      if (
        dragOrigin !== null &&
        Math.hypot(event.x - dragOrigin[0], event.y - dragOrigin[1]) *
          currentK >
          CLICK_SLOP
      ) {
        suppressClick = true;
      }
      // Instant feedback even while the sim is paused (reduced motion).
      render();
    })
    .on('end', (_event, d) => {
      // The article dot keeps its anchor; neighbors spring back to life.
      if (!d.current) {
        d.fx = null;
        d.fy = null;
      }
      if (!reduced) sim.alphaTarget(BROWNIAN_ALPHA);
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    });
  nodeSel.call(dragBehavior);
  nodeSel.on('click', (_event, d) => {
    if (suppressClick || d.current) return;
    // Soft navigation: same fetch-and-swap the router runs for link
    // clicks, so navbar / sidebar survive instead of a full reload.
    navigateTo(withBase(opts.base, d.route));
  });

  // The perpetual motion only burns frames while the chart can be seen:
  // visibilitychange covers background tabs, an IntersectionObserver on the
  // container covers the article-tail canvas scrolled out of view (its usual
  // state while the body is being read). Both feed one decision, so any
  // combination settles on stop; re-entering view restarts at the same
  // Brownian alpha, keeping the drift design unchanged.
  let inView = typeof IntersectionObserver === 'undefined';
  const syncSim = (): void => {
    if (reduced) return;
    if (simPower(inView, !document.hidden) === 'run')
      sim.alphaTarget(BROWNIAN_ALPHA).restart();
    else sim.stop();
  };
  const controller = new AbortController();
  document.addEventListener('visibilitychange', syncSim, {
    signal: controller.signal,
  });
  let containerIo: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    containerIo = new IntersectionObserver(entries => {
      inView = nearView(entries);
      syncSim();
    });
    containerIo.observe(container);
  }

  if (reduced) {
    // Fully static: settle synchronously, no timers, no continuous ticks.
    sim.stop();
    sim.tick(Math.min(400, 150 + data.nodes.length * 2));
    render();
  } else {
    // Pre-settle so the initial fit matches the resting layout; the Brownian
    // drift afterwards stays well inside the fit's padding.
    sim.stop();
    sim.tick(SETTLE_TICKS);
    render();
    sim.on('tick', ticked);
    // Start only if the canvas is on screen (the container observer corrects
    // inView with its initial callback right after mount); while running
    // alphaTarget stays above alphaMin forever: gentle perpetual motion,
    // paused offscreen.
    syncSim();
  }

  // Initial fit: once the layout has settled, zoom so the whole graph (with
  // label overhang) exactly fills the viewport — that scale is the readable
  // baseline the relative label threshold is derived from.
  const extent = nodeExtent(data.nodes);
  const fit = extent
    ? fitTransform(extent, width, height)
    : { k: 1, x: 0, y: 0 };
  const fitK = Math.max(fit.k, SCALE_MIN);
  labelZoomK = fitK * LABEL_ZOOM_FACTOR;
  svg.attr('data-fit-k', fitK.toFixed(3));
  svg.call(
    zoomBehavior.transform,
    zoomIdentity.translate(fit.x, fit.y).scale(fitK),
  );

  return {
    destroy(): void {
      controller.abort();
      containerIo?.disconnect();
      sim.stop();
      svg.remove();
    },
  };
}
