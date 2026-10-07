import path from 'node:path';

import type {
  CollectedLink,
  RelatedEdgeRef,
  RelatedLink,
} from '../../shared/types.ts';

/** Minimal page data needed to build the article-reference graph. */
export interface RelatedPageInput {
  /** Canonical page route, e.g. `/guide/a.html`. */
  route: string;
  /** Locale key of the page's content tree; edges never cross locales. */
  locale: string;
  title: string;
  links: CollectedLink[];
}

/**
 * Normalize an internal resolved href (page-relative, e.g. `../b.html#sec`)
 * to a canonical route key: fragment stripped, resolved against the source
 * route, lowercased, guaranteed to end with `.html`. Returns null when the
 * href cannot denote a page (empty path, non-`.html` target).
 */
export function normalizeRelatedRoute(
  resolved: string,
  fromRoute: string,
): string | null {
  const noAnchor = resolved.split('#', 1)[0] ?? '';
  if (noAnchor === '') return null;
  // posix.resolve strips the trailing slash, so expand directories first.
  const pathPart = noAnchor.endsWith('/') ? `${noAnchor}index.html` : noAnchor;
  const route = path.posix
    .resolve(path.posix.dirname(fromRoute), pathPart)
    .toLowerCase();
  return route.endsWith('.html') ? route : null;
}

/** Route key used for identity comparisons (case-insensitive). */
function routeKey(route: string): string {
  return route.toLowerCase();
}

/** Undirected adjacency: route key -> neighbor key -> mutual refs. */
type Adjacency = Map<string, Map<string, number>>;

/**
 * Record one link occurrence from `from` to `to`: bump the pair's mutual-ref
 * slot on both endpoints. A slot exists (and is > 0) exactly when the two
 * routes reference each other in at least one direction, and its value is
 * the bidirectional occurrence total — so adjacency membership doubles as
 * the star test and no per-pair string keys are ever built.
 */
function bumpMutual(adj: Adjacency, from: string, to: string): void {
  let a = adj.get(from);
  if (!a) adj.set(from, (a = new Map()));
  let b = adj.get(to);
  if (!b) adj.set(to, (b = new Map()));
  const refs = (a.get(to) ?? 0) + 1;
  a.set(to, refs);
  b.set(from, refs);
}

/** Neighbor key lists sorted once, shared by every page's BFS. */
function sortedNeighbors(adj: Adjacency): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [key, set] of adj) out.set(key, [...set.keys()].toSorted());
  return out;
}

/**
 * Default bound on neighbor-neighbor edges serialized per page: keeps the
 * payload bounded on hub pages (dense blogs can approach n^2 pairs).
 * Overridable per site via the `related.maxEdges` config.
 */
export const DEFAULT_MAX_GRAPH_EDGES = 240;

/**
 * Default bound on nodes serialized per page graph (the page itself
 * included), applied at every BFS depth. Overridable per site via the
 * `related.maxNodes` config; larger sites raise it together with
 * `related.maxEdges`.
 */
export const DEFAULT_MAX_GRAPH_NODES = 60;

/**
 * Default hub fallback limit for multi-hop graphs: pages whose related-node
 * count (the page itself included) exceeds it render one hop only, and a
 * one-hop star larger than it keeps only its strongest members — the limit
 * doubles as the related graph's rendered-node ceiling. The framework
 * default only catches extreme hubs; sites tune it via the
 * `related.twoHopNodeLimit` config.
 */
export const DEFAULT_TWO_HOP_NODE_LIMIT = 48;

/** Options of the related-map aggregation. */
export interface RelatedOptions {
  /** BFS depth; 1 = direct neighbors + induced edges (the default). */
  depth?: number;
  /** Per-page node cap (the page itself included). */
  maxNodes?: number;
  /** Per-page member-edge cap (unordered pairs among members). */
  maxEdges?: number;
  /**
   * Hub fallback: pages above this node count (the page itself included)
   * collapse to the one-hop star instead of drawing `depth` hops, and a
   * star larger than it keeps only its strongest members — the rendered
   * node ceiling of the related graph.
   */
  twoHopNodeLimit?: number;
}

interface Pair {
  a: RelatedLink;
  b: RelatedLink;
  refs: number;
}

/** Strength desc, then route asc: stable, diff-friendly edge order. */
function compareEdgeRef(x: RelatedEdgeRef, y: RelatedEdgeRef): number {
  return y.refs - x.refs || x.route.localeCompare(y.route);
}

/**
 * Keep the `max` strongest pairs; ties break by route pair so the payload
 * is deterministic. Returns the input array when within budget.
 */
export function capPairs(pairs: Pair[], max: number): Pair[] {
  if (pairs.length <= max) return pairs;
  return pairs
    .toSorted(
      (x, y) =>
        y.refs - x.refs ||
        x.a.route.localeCompare(y.a.route) ||
        x.b.route.localeCompare(y.b.route),
    )
    .slice(0, max);
}

/**
 * Attach `links` to every member of the graph's member list: the mutual-
 * reference edges among members (the induced subgraph the related-articles
 * graph draws beyond the bare star). Each unordered pair is stored on both
 * endpoints; `links` is omitted entirely when there is no such edge.
 */
function attachMemberLinks(
  list: RelatedLink[],
  adj: Adjacency,
  maxEdges: number,
): void {
  if (list.length < 2) return;
  const pairs: Pair[] = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b === undefined) continue;
      // The adjacency slot already holds the bidirectional ref total.
      const refs = adj.get(routeKey(a.route))?.get(routeKey(b.route)) ?? 0;
      if (refs > 0) pairs.push({ a, b, refs });
    }
  }
  if (pairs.length === 0) return;
  for (const p of capPairs(pairs, maxEdges)) {
    (p.a.links ??= []).push({ route: p.b.route, refs: p.refs });
    (p.b.links ??= []).push({ route: p.a.route, refs: p.refs });
  }
  // Sort per-link edge lists for stable, diff-friendly payloads.
  for (const link of list) {
    if (link.links) link.links = link.links.toSorted(compareEdgeRef);
  }
}

/** Whether any neighbor of `key` is already accepted (order-free scan). */
function hasAcceptedNeighbor(
  adj: Adjacency,
  key: string,
  accepted: Set<string>,
): boolean {
  for (const w of adj.get(key)?.keys() ?? []) {
    if (accepted.has(w)) return true;
  }
  return false;
}

interface BfsTree {
  /** Route key -> BFS distance (>= 1; the page itself is absent). */
  dist: Map<string, number>;
}

/** BFS from one page up to `depth` hops over the pre-sorted adjacency. */
function bfsDepth(
  from: string,
  depth: number,
  sortedAdj: Map<string, string[]>,
): BfsTree {
  const dist = new Map<string, number>();
  let frontier = [from];
  for (let d = 1; d <= depth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const v of frontier) {
      // Pre-sorted expansion keeps the tree deterministic regardless of the
      // adjacency map's insertion order.
      for (const w of sortedAdj.get(v) ?? []) {
        if (!dist.has(w) && w !== from) {
          dist.set(w, d);
          next.push(w);
        }
      }
    }
    frontier = next;
  }
  return { dist };
}

/**
 * Pick at most `budget` members, tier by tier (BFS distance), strongest
 * first; a member is only admitted while it still touches the accepted set
 * (distance-1 members always do via the page). Connectivity is preserved by
 * construction; ties break by route for deterministic payloads.
 */
function pruneMembers(
  from: string,
  dist: Map<string, number>,
  adj: Adjacency,
  budget: number,
): string[] {
  // Weight: mutual refs to the page plus refs against the full candidate
  // set — strong direct references must not lose to route-order ties.
  const strength = (key: string): number => {
    let total = adj.get(key)?.get(from) ?? 0;
    for (const [w, refs] of adj.get(key) ?? []) {
      if (w !== from && dist.has(w)) total += refs;
    }
    return total;
  };
  const accepted: string[] = [];
  const acceptedSet = new Set<string>();
  const maxDist = Math.max(...dist.values(), 1);
  for (let d = 1; d <= maxDist && accepted.length < budget; d++) {
    const tier = [...dist.entries()]
      .filter(([, dd]) => dd === d)
      .map(([key]) => key)
      .map(key => ({ key, strength: strength(key) }))
      .toSorted(
        (x, y) => y.strength - x.strength || x.key.localeCompare(y.key),
      );
    for (const { key } of tier) {
      if (accepted.length >= budget) break;
      // Distance-1 members hang off the page; deeper ones need an accepted
      // bridge or the graph would disconnect.
      const connected = d === 1 || hasAcceptedNeighbor(adj, key, acceptedSet);
      if (connected) {
        accepted.push(key);
        acceptedSet.add(key);
      }
    }
  }
  return accepted;
}

/**
 * Build the page -> related-pages map from collected markdown links.
 *
 * - Only non-dead internal links to pages that actually exist count; dead
 *   links are build errors anyway, and unknown targets are ignored here so
 *   dev mode stays tolerant.
 * - Each link occurrence counts once; refs(A,B) is the bidirectional total
 *   of A->B plus B->A. Self-loops are ignored.
 * - Cross-locale links are ignored: the graph only ever shows same-locale
 *   articles, so a page linking its translated counterpart contributes
 *   nothing (locale switcher covers cross-language navigation instead).
 * - Members additionally carry `links`: the mutual-reference edges among
 *   the members (capped), consumed by the interactive related-articles
 *   graph. depth=1 lists direct neighbors only; depth=N lists every article
 *   within N hops — members beyond hop 1 carry `refs: 0` (no direct edge
 *   to the page). The node/edge caps apply at every depth, strongest first.
 * - Multi-hop hub fallback: a page whose node count exceeds
 *   `twoHopNodeLimit` renders as the depth-1 star instead, keeping its
 *   canvas labels readable. A star larger than the limit (a changelog hub
 *   can reference the whole site directly) keeps only its strongest
 *   `twoHopNodeLimit - 1` members, so the limit caps rendered nodes at
 *   every depth.
 */
export function buildRelatedMap(
  pages: RelatedPageInput[],
  options: RelatedOptions = {},
): Map<string, RelatedLink[]> {
  // Site config arrives explicitly (SiteStore passes config.related); omitted
  // keys fall back to the framework defaults.
  const depth = Math.max(1, Math.trunc(options.depth ?? 1));
  const maxNodes = Math.max(
    2,
    Math.trunc(options.maxNodes ?? DEFAULT_MAX_GRAPH_NODES),
  );
  const maxEdges = Math.max(
    1,
    Math.trunc(options.maxEdges ?? DEFAULT_MAX_GRAPH_EDGES),
  );
  const twoHopNodeLimit = Math.max(
    2,
    Math.trunc(options.twoHopNodeLimit ?? DEFAULT_TWO_HOP_NODE_LIMIT),
  );
  const byKey = new Map<string, RelatedPageInput>();
  for (const page of pages) byKey.set(routeKey(page.route), page);

  // One pass over the links builds the undirected adjacency (O(links)): each
  // valid occurrence bumps the pair's mutual-ref slot on both endpoints.
  // Neighbor enumeration below replaces the old all-routes scan per page,
  // dropping the map build from O(N^2) to O(N + E).
  const adj: Adjacency = new Map();
  for (const page of pages) {
    const from = routeKey(page.route);
    for (const link of page.links) {
      if (link.kind !== 'internal' || link.dead) continue;
      const to = normalizeRelatedRoute(link.resolved, page.route);
      if (to === null || to === from) continue;
      const target = byKey.get(to);
      // The related graph must stay same-locale: a page linking its EN
      // counterpart would otherwise leak the other language's articles into
      // the canvas. Unknown targets stay ignored (dev tolerance).
      if (!target || target.locale !== page.locale) continue;
      bumpMutual(adj, from, to);
    }
  }
  // Neighbor key lists sorted once, reused by every page's BFS (the star
  // path never looks at them).
  const sortedAdj = depth > 1 ? sortedNeighbors(adj) : null;

  const out = new Map<string, RelatedLink[]>();
  /**
   * byKey lookup for member keys. Member keys originate from byKey's own
   * key set (starMembers) or from BFS over its adjacency, so a miss is a
   * logic error, not a content condition — fail loudly instead of asserting
   * non-null.
   */
  const pageOf = (key: string): RelatedPageInput => {
    const page = byKey.get(key);
    if (!page) {
      throw new Error(
        `[absolute-press] related: route key "${key}" missing from the page map`,
      );
    }
    return page;
  };
  for (const page of pages) {
    const from = routeKey(page.route);
    // The classic star: direct neighbors with a mutual reference. Enumeration
    // order is irrelevant — members are fully sorted below (refs desc, then
    // route asc; routes are unique, so that order is total).
    const starMembers = (): string[] => [...(adj.get(from)?.keys() ?? [])];
    let memberKeys: string[];
    if (depth === 1 || sortedAdj === null) {
      // Direct neighbors only — the classic star.
      memberKeys = starMembers();
    } else {
      const { dist } = bfsDepth(from, depth, sortedAdj);
      if (dist.size + 1 > twoHopNodeLimit) {
        // Hub page: the full depth-hop graph crowds the canvas labels into
        // an unreadable blob, so fall back to the one-hop star.
        memberKeys = starMembers();
      } else {
        memberKeys = pruneMembers(from, dist, adj, maxNodes - 1);
      }
    }
    let list: RelatedLink[] = memberKeys
      .map(key => {
        const target = pageOf(key);
        return {
          route: target.route,
          title: target.title,
          // Deep BFS members have no direct edge to the page: the slot is
          // undefined and reads as refs 0, like the old on-the-fly lookup.
          refs: adj.get(from)?.get(key) ?? 0,
        };
      })
      .toSorted((a, b) => b.refs - a.refs || a.route.localeCompare(b.route));
    // The node cap applies at every depth. The star path keeps the
    // strongest mutual references — the list's sort order matches
    // pruneMembers' tier-1 strength ranking.
    if (list.length > maxNodes - 1) list = list.slice(0, maxNodes - 1);
    // Hub star cap: the fallback exists to keep the canvas readable, but a
    // changelog-style hub can reference the whole site directly, and an
    // oversized star is just as unreadable. The BFS path above never
    // exceeds the limit, so this only ever bites bare stars.
    if (list.length > twoHopNodeLimit - 1)
      list = list.slice(0, twoHopNodeLimit - 1);
    attachMemberLinks(list, adj, maxEdges);
    out.set(page.route, list);
  }
  return out;
}
