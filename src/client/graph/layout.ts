import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

import type { PagePayload } from '../../shared/types';

/**
 * Dot radii in viewBox units, sized against the 9px graph labels
 * (graph.css): the default fit shows dots and text at a compact,
 * body-text-scaled size.
 */
export const NODE_R = 4;
export const CURRENT_R = 5.5;

/** Label truncation length (graph labels must stay readable at 9px). */
const LABEL_MAX = 26;

/** Screen-space padding kept clear around the fitted graph. */
export const FIT_PADDING = 48;
/**
 * Cap on the initial fit scale: the default view is the readable one, so
 * this cap bounds the effective on-screen label size (9px * k). A sparse
 * two-node graph must not blow up to dot-the-size-of-the-canvas zoom.
 */
export const FIT_MAX_K = 1.35;
/**
 * Zoom-in factor over the initial fit scale above which every label shows
 * (relative threshold). At the fit itself only the one-hop ring is labeled
 * (see defaultLabelSet) — hub canvases stay readable until the reader
 * deliberately leans in.
 */
export const LABEL_ZOOM_FACTOR = 1.15;
/** Right-side overhang of a truncated label, in viewBox units. */
export const LABEL_OVERHANG = 80;

/** Bounding box of a graph, in viewBox units. */
export interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Bounding box of the laid-out nodes. Dots on the left half of the canvas
 * flip their label to the left (the chart anchors labels away from the
 * midline, see chart.ts), so the label overhang pads both horizontal edges
 * and the fitted view always shows text, not just dots. null when nothing
 * is placed.
 */
export function nodeExtent(
  nodes: GraphNode[],
  includeLabels = true,
): Extent | null {
  let extent: Extent | null = null;
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    const minX = n.x - n.r - (includeLabels ? LABEL_OVERHANG : 0);
    const minY = n.y - n.r;
    const maxX = n.x + n.r + (includeLabels ? LABEL_OVERHANG : 0);
    const maxY = n.y + n.r;
    extent = extent
      ? {
          minX: Math.min(extent.minX, minX),
          minY: Math.min(extent.minY, minY),
          maxX: Math.max(extent.maxX, maxX),
          maxY: Math.max(extent.maxY, maxY),
        }
      : { minX, minY, maxX, maxY };
  }
  return extent;
}

/** d3-zoom-style transform: screen = k * graph + (x, y). */
export interface FitTransform {
  k: number;
  x: number;
  y: number;
}

/**
 * Zoom transform that fits `extent` into a width x height viewport with
 * `padding` on all sides, centered. Never exceeds FIT_MAX_K so sparse
 * graphs stay calm; degenerate extents fall back to k = 1.
 */
export function fitTransform(
  extent: Extent,
  width: number,
  height: number,
  padding = FIT_PADDING,
): FitTransform {
  const w = Math.max(extent.maxX - extent.minX, 1);
  const h = Math.max(extent.maxY - extent.minY, 1);
  const raw = Math.min((width - 2 * padding) / w, (height - 2 * padding) / h);
  const k = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 1, FIT_MAX_K);
  return {
    k,
    x: width / 2 - (k * (extent.minX + extent.maxX)) / 2,
    y: height / 2 - (k * (extent.minY + extent.maxY)) / 2,
  };
}

/** A force-simulation node: one article on the canvas. */
export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  route: string;
  current: boolean;
  /** Dot radius. */
  r: number;
}

/** Undirected reference edge; d3 replaces string endpoints with nodes. */
export interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  sourceId: string;
  targetId: string;
  refs: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** d3 link endpoint: an id before simulation init, the node object after. */
export type Endpoint = NonNullable<GraphEdge['source']>;

/** Narrow a link endpoint to its node; null while endpoints are raw ids. */
export function endpointOf(v: Endpoint): GraphNode | null {
  return typeof v === 'object' ? v : null;
}

/**
 * Edge stroke width (px) from mutual refs: 1px base, +0.75 per extra ref,
 * capped at 4px so hub edges stay readable.
 */
export function edgeWidth(refs: number): number {
  return Math.min(4, 1 + 0.75 * Math.max(0, refs - 1));
}

/** Edge opacity from refs: 0.3 at one ref rising to 0.85. */
export function edgeOpacity(refs: number): number {
  return Math.min(0.85, 0.3 + 0.11 * Math.max(0, refs - 1));
}

/** Truncate long titles for canvas labels. */
export function graphLabel(title: string, max = LABEL_MAX): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

/**
 * Adjacency map (undirected) for hover highlighting: who must stay lit
 * while one node is hovered.
 */
export function adjacencyMap(edges: GraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const touch = (a: string, b: string): void => {
    let set = adj.get(a);
    if (!set) adj.set(a, (set = new Set()));
    set.add(b);
  };
  for (const e of edges) {
    touch(e.sourceId, e.targetId);
    touch(e.targetId, e.sourceId);
  }
  return adj;
}

/**
 * Default visible-label set (M9): the current article plus its one-hop
 * neighbors. Deeper members stay dot-only until the reader hovers into
 * their neighborhood or zooms in, so a hub canvas keeps a readable
 * default state instead of printing every label at once.
 */
export function defaultLabelSet(
  currentId: string,
  edges: GraphEdge[],
): Set<string> {
  const set = new Set<string>([currentId]);
  for (const e of edges) {
    if (e.sourceId === currentId) set.add(e.targetId);
    else if (e.targetId === currentId) set.add(e.sourceId);
  }
  return set;
}

/**
 * Payload -> force-graph data. Nodes: the current page (marked `current`)
 * plus its related articles. Edges: the page star (only members with
 * `refs > 0` — deeper BFS members connect through their bridge edges) plus
 * the member-member edges carried by `RelatedLink.links`, deduped to one
 * undirected edge per pair (the payload lists each pair on both endpoints).
 */
export function toGraphData(payload: PagePayload): GraphData {
  const page = payload.page;
  const nodes: GraphNode[] = [
    {
      id: page.route,
      title: page.title || page.route,
      route: page.route,
      current: true,
      r: CURRENT_R,
    },
  ];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (sourceId: string, targetId: string, refs: number): void => {
    const key = [sourceId, targetId].toSorted().join('\n');
    if (sourceId === targetId || seen.has(key)) return;
    seen.add(key);
    edges.push({
      sourceId,
      targetId,
      refs,
      source: sourceId,
      target: targetId,
    });
  };
  for (const r of payload.related ?? []) {
    nodes.push({
      id: r.route,
      title: r.title || r.route,
      route: r.route,
      current: false,
      r: NODE_R,
    });
    if (r.refs > 0) addEdge(page.route, r.route, r.refs);
    for (const l of r.links ?? []) addEdge(r.route, l.route, l.refs);
  }
  return { nodes, edges };
}
