import { describe, expect, it } from 'vitest';

import type { CollectedLink, RelatedLink } from '../../../shared/types.ts';
import type { RelatedPageInput } from '../related.ts';
import {
  buildRelatedMap,
  capPairs,
  DEFAULT_MAX_GRAPH_EDGES,
  DEFAULT_MAX_GRAPH_NODES,
  DEFAULT_TWO_HOP_NODE_LIMIT,
  normalizeRelatedRoute,
} from '../related.ts';

function link(
  resolved: string,
  kind: CollectedLink['kind'] = 'internal',
  dead = false,
): CollectedLink {
  return { raw: resolved, resolved, kind, dead };
}

function page(
  route: string,
  links: CollectedLink[],
  title = route,
  locale = 'zh',
): RelatedPageInput {
  return { route, locale, title, links };
}

describe('normalizeRelatedRoute', () => {
  it('resolves page-relative hrefs against the source route', () => {
    expect(normalizeRelatedRoute('b.html', '/guide/a.html')).toBe(
      '/guide/b.html',
    );
    expect(normalizeRelatedRoute('../coding/b.html', '/guide/a.html')).toBe(
      '/coding/b.html',
    );
  });

  it('strips fragments and lowercases', () => {
    expect(normalizeRelatedRoute('B.html#Sec', '/Guide/a.html')).toBe(
      '/guide/b.html',
    );
  });

  it('expands directory hrefs to index.html', () => {
    expect(normalizeRelatedRoute('../guide/', '/coding/a.html')).toBe(
      '/guide/index.html',
    );
  });

  it('rejects empty paths and non-html targets', () => {
    expect(normalizeRelatedRoute('#only-anchor', '/a.html')).toBeNull();
    expect(normalizeRelatedRoute('img.png', '/a.html')).toBeNull();
  });
});

describe('buildRelatedMap', () => {
  it('sums mutual references bidirectionally', () => {
    // A links B twice, B links A once -> refs 3 on both sides.
    const map = buildRelatedMap([
      page('/a.html', [link('b.html'), link('b.html#x')], 'A'),
      page('/b.html', [link('a.html')], 'B'),
      page('/c.html', [], 'C'),
    ]);
    expect(map.get('/a.html')).toEqual([
      { route: '/b.html', title: 'B', refs: 3 },
    ]);
    expect(map.get('/b.html')).toEqual([
      { route: '/a.html', title: 'A', refs: 3 },
    ]);
    expect(map.get('/c.html')).toEqual([]);
  });

  it('ignores self-loops, dead links and non-internal kinds', () => {
    const map = buildRelatedMap([
      page('/a.html', [
        link('a.html'), // self-loop
        link('b.html', 'internal', true), // dead
        link('https://example.com', 'external'),
        link('#sec', 'anchor'),
        link('b.html'),
      ]),
      page('/b.html', []),
    ]);
    expect(map.get('/a.html')).toEqual([
      { route: '/b.html', title: '/b.html', refs: 1 },
    ]);
    expect(map.get('/b.html')).toEqual([
      { route: '/a.html', title: '/a.html', refs: 1 },
    ]);
  });

  it('ignores links to unknown routes (dev tolerance)', () => {
    const map = buildRelatedMap([page('/a.html', [link('ghost.html')])]);
    expect(map.get('/a.html')).toEqual([]);
  });

  it('matches routes case-insensitively but reports canonical casing', () => {
    const map = buildRelatedMap([
      page('/Guide/A.html', [link('b.html')], 'A'),
      page('/guide/b.html', [], 'B'),
    ]);
    expect(map.get('/Guide/A.html')).toEqual([
      { route: '/guide/b.html', title: 'B', refs: 1 },
    ]);
    expect(map.get('/guide/b.html')).toEqual([
      { route: '/Guide/A.html', title: 'A', refs: 1 },
    ]);
  });

  it('sorts by refs desc, then route asc', () => {
    const map = buildRelatedMap([
      page('/a.html', [link('c.html'), link('b.html'), link('c.html')]),
      page('/b.html', []),
      page('/c.html', []),
    ]);
    expect(map.get('/a.html')?.map(r => r.route)).toEqual([
      '/c.html',
      '/b.html',
    ]);
  });

  it('drops cross-locale links so graphs stay same-locale', () => {
    const map = buildRelatedMap([
      page('/en/guide.html', [link('../coding/a.html')], 'EN guide', 'en'),
      page('/coding/a.html', [link('../en/guide.html')], 'A', 'zh'),
    ]);
    expect(map.get('/en/guide.html')).toEqual([]);
    expect(map.get('/coding/a.html')).toEqual([]);
  });

  it('still counts links between pages of the same non-default locale', () => {
    const map = buildRelatedMap([
      page('/en/guide.html', [link('tips.html')], 'EN guide', 'en'),
      page('/en/tips.html', [], 'EN tips', 'en'),
    ]);
    expect(map.get('/en/guide.html')).toEqual([
      { route: '/en/tips.html', title: 'EN tips', refs: 1 },
    ]);
  });
});

describe('buildRelatedMap induced links', () => {
  it('attaches neighbor-neighbor edges to both endpoints', () => {
    // a links b and c; b links c -> for page a, b and c are connected.
    const map = buildRelatedMap([
      page('/a.html', [link('b.html'), link('c.html')], 'A'),
      page('/b.html', [link('a.html'), link('c.html')], 'B'),
      page('/c.html', [link('a.html')], 'C'),
    ]);
    const a = map.get('/a.html') ?? [];
    const b = a.find(r => r.route === '/b.html');
    const c = a.find(r => r.route === '/c.html');
    // b-c edges: b->c once, c->b zero -> refs 1; a->c twice + c->a once = 3.
    expect(b?.links).toEqual([{ route: '/c.html', refs: 1 }]);
    expect(c?.links).toEqual([{ route: '/b.html', refs: 1 }]);
  });

  it('sums bidirectional refs for induced edges and omits links when absent', () => {
    // b -> c three times, c -> b once: induced refs 4 on both endpoints.
    const map = buildRelatedMap([
      page('/a.html', [link('b.html'), link('c.html')], 'A'),
      page('/b.html', [link('c.html'), link('c.html'), link('c.html')], 'B'),
      page('/c.html', [link('b.html')], 'C'),
    ]);
    const a = map.get('/a.html') ?? [];
    expect(a.find(r => r.route === '/b.html')?.links).toEqual([
      { route: '/c.html', refs: 4 },
    ]);
    // A lone neighbor gets no `links` key at all (payload stays small).
    const lone = buildRelatedMap([
      page('/x.html', [link('y.html')], 'X'),
      page('/y.html', [], 'Y'),
    ]);
    expect(lone.get('/x.html')).toEqual([
      { route: '/y.html', title: 'Y', refs: 1 },
    ]);
  });

  it('never lists the page itself in induced edges', () => {
    const map = buildRelatedMap([
      page('/a.html', [link('b.html'), link('c.html')], 'A'),
      page('/b.html', [link('c.html')], 'B'),
      page('/c.html', [], 'C'),
    ]);
    const a = map.get('/a.html') ?? [];
    for (const r of a) {
      for (const l of r.links ?? []) expect(l.route).not.toBe('/a.html');
    }
  });
});

function pair(ra: string, rb: string, refs: number) {
  return {
    a: { route: ra, title: ra, refs: 1 },
    b: { route: rb, title: rb, refs: 1 },
    refs,
  };
}

const zeroPad = (n: number): string => String(n).padStart(2, '0');

describe('capPairs', () => {
  it('returns the input when within budget', () => {
    const pairs = [pair('/a.html', '/b.html', 2)];
    expect(capPairs(pairs, DEFAULT_MAX_GRAPH_EDGES)).toBe(pairs);
  });

  it('keeps strongest pairs and breaks ties by route order', () => {
    const kept = capPairs(
      [
        pair('/c.html', '/d.html', 1),
        pair('/a.html', '/b.html', 5),
        pair('/e.html', '/f.html', 1),
      ],
      2,
    );
    expect(kept.map(p => [p.a.route, p.b.route])).toEqual([
      ['/a.html', '/b.html'],
      ['/c.html', '/d.html'],
    ]);
  });
});

// a -> b -> c -> d, no back edges: a chain of one-way references.
function chainPages(): RelatedPageInput[] {
  return [
    page('/a.html', [link('b.html')], 'A'),
    page('/b.html', [link('c.html')], 'B'),
    page('/c.html', [link('d.html')], 'C'),
    page('/d.html', [], 'D'),
  ];
}

describe('buildRelatedMap depth', () => {
  it('keeps the classic star at depth 1', () => {
    const map = buildRelatedMap(chainPages(), { depth: 1 });
    expect(map.get('/a.html')).toEqual([
      { route: '/b.html', title: 'B', refs: 1 },
    ]);
    // d is referenced by c, so it sees a direct star edge to c.
    expect(map.get('/d.html')).toEqual([
      { route: '/c.html', title: 'C', refs: 1 },
    ]);
  });

  it('depth 2 adds second-hop articles with refs 0 and bridge edges', () => {
    const map = buildRelatedMap(chainPages(), { depth: 2 });
    expect(map.get('/a.html')).toEqual([
      {
        route: '/b.html',
        title: 'B',
        refs: 1,
        links: [{ route: '/c.html', refs: 1 }],
      },
      {
        route: '/c.html',
        title: 'C',
        refs: 0,
        links: [{ route: '/b.html', refs: 1 }],
      },
    ]);
    // Every page gets its own rooted view: for c, b and d are direct
    // neighbors while a arrives at hop 2 (refs 0).
    expect(map.get('/c.html')?.map(r => r.route)).toEqual([
      '/b.html',
      '/d.html',
      '/a.html',
    ]);
  });

  it('depth 3 reaches the whole chain and stays connected', () => {
    const map = buildRelatedMap(chainPages(), { depth: 3 });
    const list = map.get('/a.html') ?? [];
    expect(list.map(r => r.route)).toEqual(['/b.html', '/c.html', '/d.html']);
    // Pairs are stored on both endpoints; dedupe for comparison.
    const pairs = [
      ...new Set(
        list.flatMap(r =>
          (r.links ?? []).map(l => [r.route, l.route].toSorted().join('~')),
        ),
      ),
    ].toSorted();
    expect(pairs).toEqual(['/b.html~/c.html', '/c.html~/d.html']);
  });

  it('collapses a page to the one-hop star above twoHopNodeLimit', () => {
    // The chain's depth-2 view of a holds 3 nodes (a, b, c); a limit of 2
    // counts as hub and falls back to the bare star.
    const map = buildRelatedMap(chainPages(), {
      depth: 2,
      twoHopNodeLimit: 2,
    });
    expect(map.get('/a.html')).toEqual([
      { route: '/b.html', title: 'B', refs: 1 },
    ]);
  });

  it('keeps the multi-hop graph at the twoHopNodeLimit', () => {
    const map = buildRelatedMap(chainPages(), {
      depth: 2,
      twoHopNodeLimit: 3,
    });
    expect(map.get('/a.html')?.map(r => r.route)).toEqual([
      '/b.html',
      '/c.html',
    ]);
  });

  it('merges partial options with the built-in defaults', () => {
    // depth omitted -> default 1 star even though twoHopNodeLimit is set;
    // the full options object (site config) reaches the same result.
    const pages = chainPages();
    expect(
      buildRelatedMap(pages, { twoHopNodeLimit: 2 }).get('/a.html'),
    ).toEqual([{ route: '/b.html', title: 'B', refs: 1 }]);
    expect(
      buildRelatedMap(pages, { depth: 2, twoHopNodeLimit: 2 }).get('/a.html'),
    ).toEqual([{ route: '/b.html', title: 'B', refs: 1 }]);
    expect(
      buildRelatedMap(pages)
        .get('/a.html')
        ?.map(r => r.route),
    ).toEqual(['/b.html']);
  });

  it('caps an oversized hub star at twoHopNodeLimit - 1, strongest first', () => {
    const pages: RelatedPageInput[] = [
      // 60 direct neighbors, all refs 1, plus one weak-route neighbor (zz)
      // with refs 5: the strength weighting must keep zz over b60.
      page(
        '/a.html',
        [
          ...Array.from({ length: 60 }, (_, i) =>
            link(`b${zeroPad(i + 1)}.html`),
          ),
          link('zz.html'),
          link('zz.html'),
          link('zz.html'),
          link('zz.html'),
          link('zz.html'),
        ],
        'A',
      ),
      ...Array.from({ length: 60 }, (_, i) =>
        page(`/b${zeroPad(i + 1)}.html`, [], `B${zeroPad(i + 1)}`),
      ),
      page('/zz.html', [], 'ZZ'),
    ];
    // 61 candidates overflow the hub limit, so the star keeps only the
    // strongest twoHopNodeLimit - 1 members.
    const map = buildRelatedMap(pages, { depth: 2 });
    const list = map.get('/a.html') ?? [];
    expect(list).toHaveLength(DEFAULT_TWO_HOP_NODE_LIMIT - 1);
    expect(list.find(r => r.route === '/zz.html')?.refs).toBe(5);
    // zz plus the 46 strongest route-order ties fill the budget; the
    // weakest ties (b47 and below by refs/route order) drop out.
    expect(list.find(r => r.route === '/b46.html')).toBeDefined();
    expect(list.find(r => r.route === '/b47.html')).toBeUndefined();
  });

  it('caps a depth-1 star at twoHopNodeLimit - 1 too', () => {
    const pages: RelatedPageInput[] = [
      page(
        '/a.html',
        Array.from({ length: 10 }, (_, i) => link(`b${i}.html`)),
        'A',
      ),
      ...Array.from({ length: 10 }, (_, i) => page(`/b${i}.html`, [], `B${i}`)),
    ];
    const list = buildRelatedMap(pages, {
      depth: 1,
      twoHopNodeLimit: 5,
    }).get('/a.html');
    expect(list?.map(r => r.route)).toEqual([
      '/b0.html',
      '/b1.html',
      '/b2.html',
      '/b3.html',
    ]);
  });

  it('honors custom node and edge caps', () => {
    const pages: RelatedPageInput[] = [
      page(
        '/a.html',
        Array.from({ length: 10 }, (_, i) => link(`b${i}.html`)),
        'A',
      ),
      ...Array.from({ length: 10 }, (_, i) => page(`/b${i}.html`, [], `B${i}`)),
    ];
    const list = buildRelatedMap(pages, { depth: 1, maxNodes: 5 }).get(
      '/a.html',
    );
    expect(list).toHaveLength(4);
    // Strongest first within the budget.
    expect(list?.[0]).toEqual({ route: '/b0.html', title: 'B0', refs: 1 });
  });

  it('caps induced edges at a custom maxEdges', () => {
    // Every pair of neighbors is interconnected: 15 induced pairs total.
    const links = Array.from({ length: 6 }, (_, j) => link(`b${j}.html`));
    const pages: RelatedPageInput[] = [
      page('/a.html', links, 'A'),
      ...Array.from({ length: 6 }, (_, i) =>
        page(`/b${i}.html`, links.toSpliced(i, 1)),
      ),
    ];
    const list = buildRelatedMap(pages, { depth: 1, maxEdges: 4 }).get(
      '/a.html',
    );
    const pairs = new Set(
      (list ?? []).flatMap(r =>
        (r.links ?? []).map(l => [r.route, l.route].toSorted().join('~')),
      ),
    );
    expect(pairs.size).toBe(4);
  });

  it('never admits a deep member without an accepted bridge', () => {
    // b01..b59 (refs 2) fill the budget; b60 (refs 1, weakest) is dropped
    // and with it c, whose only bridge is b60. The limit stays above the
    // neighborhood size, so pruneMembers runs rather than the hub fallback.
    const pages: RelatedPageInput[] = [
      page(
        '/a.html',
        [
          ...Array.from({ length: 59 }, (_, i) =>
            Array.from({ length: 2 }, () =>
              link(`b${String(i + 1).padStart(2, '0')}.html`),
            ),
          ).flat(),
          link('b60.html'),
        ],
        'A',
      ),
      page('/b60.html', [link('c.html')], 'B60'),
      page('/c.html', [], 'C'),
      ...Array.from({ length: 59 }, (_, i) =>
        page(`/b${String(i + 1).padStart(2, '0')}.html`, []),
      ),
    ];
    const map = buildRelatedMap(pages, { depth: 2, twoHopNodeLimit: 100 });
    const list = map.get('/a.html') ?? [];
    expect(list).toHaveLength(DEFAULT_MAX_GRAPH_NODES - 1);
    expect(list.find(r => r.route === '/c.html')).toBeUndefined();
    expect(list.find(r => r.route === '/b60.html')).toBeUndefined();
    // The admitted set stays connected: every member hangs off the page.
    for (const r of list) expect(r.refs).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Order semantics locked for the adjacency-index implementation: member
// enumeration order must never leak into the output (all downstream orders
// are total: refs desc, then route asc, routes unique per entry).
// ---------------------------------------------------------------------------

/** Directed pair key; mirrors the pre-refactor "\0" keying. */
const pk = (a: string, b: string): string => `${a}\0${b}`;

/**
 * Naive O(N^2) reference of the pre-refactor star path: full route-key scan
 * over "\0"-keyed directed counts. Contrasted against the index
 * implementation to lock its output (key set, contents, member order).
 */
function naiveStarMap(pages: RelatedPageInput[]): Map<string, RelatedLink[]> {
  const byKey = new Map<string, RelatedPageInput>();
  for (const p of pages) byKey.set(p.route.toLowerCase(), p);
  const counts = new Map<string, number>();
  for (const p of pages) {
    const from = p.route.toLowerCase();
    for (const l of p.links) {
      if (l.kind !== 'internal' || l.dead) continue;
      const to = normalizeRelatedRoute(l.resolved, p.route);
      if (to === null || to === from || !byKey.has(to)) continue;
      counts.set(pk(from, to), (counts.get(pk(from, to)) ?? 0) + 1);
    }
  }
  const mutual = (a: string, b: string): number =>
    (counts.get(pk(a, b)) ?? 0) + (counts.get(pk(b, a)) ?? 0);
  const out = new Map<string, RelatedLink[]>();
  for (const p of pages) {
    const from = p.route.toLowerCase();
    const list: RelatedLink[] = [...byKey.keys()]
      .filter(k => k !== from && mutual(from, k) > 0)
      .map(k => {
        const t = byKey.get(k);
        if (!t) throw new Error(`route key "${k}" missing`);
        return { route: t.route, title: t.title, refs: mutual(from, k) };
      })
      .toSorted((a, b) => b.refs - a.refs || a.route.localeCompare(b.route));
    // Induced member-member edges off the pair-key counts, mirroring the
    // pre-refactor attachMemberLinks (uncapped: these graphs stay below the
    // default node/edge/hub budgets).
    if (list.length >= 2) {
      const pairs = [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (!b) continue;
          const refs =
            (counts.get(pk(a.route.toLowerCase(), b.route.toLowerCase())) ??
              0) +
            (counts.get(pk(b.route.toLowerCase(), a.route.toLowerCase())) ?? 0);
          if (refs > 0) pairs.push({ a, b, refs });
        }
      }
      if (pairs.length > 0) {
        for (const pr of capPairs(pairs, DEFAULT_MAX_GRAPH_EDGES)) {
          (pr.a.links ??= []).push({ route: pr.b.route, refs: pr.refs });
          (pr.b.links ??= []).push({ route: pr.a.route, refs: pr.refs });
        }
        for (const l of list) {
          if (l.links) {
            l.links = l.links.toSorted(
              (x, y) => y.refs - x.refs || x.route.localeCompare(y.route),
            );
          }
        }
      }
    }
    out.set(p.route, list);
  }
  return out;
}

/** Deterministic LCG so random-graph failures reproduce. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Fisher-Yates copy; the input array is left untouched. */
function shuffled<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)) % (i + 1);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Mixed graph: valid refs (some duplicated), dead/external/anchor/self/
 * unknown links, and case-variant routes every 4th page. */
function randomGraph(rand: () => number, n: number): RelatedPageInput[] {
  const names = Array.from(
    { length: n },
    (_, i) => `p${String(i).padStart(2, '0')}.html`,
  );
  const nameAt = (i: number): string => names[i % n] ?? 'p00.html';
  return Array.from({ length: n }, (_, i) => {
    const self = nameAt(i);
    // Canonical casing exercise: uppercased routes still match lowercase
    // hrefs through normalization.
    const route = i % 4 === 3 ? `/${self.toUpperCase()}` : `/${self}`;
    const links: CollectedLink[] = [];
    const count = Math.floor(rand() * 5);
    for (let j = 0; j < count; j++) {
      const roll = rand();
      if (roll < 0.62) links.push(link(nameAt(Math.floor(rand() * n))));
      else if (roll < 0.7) links.push(link(`${nameAt(j)}#frag`));
      else if (roll < 0.76) links.push(link('ghost.html', 'internal', true));
      else if (roll < 0.82) links.push(link('ghost.html')); // unknown target
      else if (roll < 0.88) links.push(link('https://example.com', 'external'));
      else if (roll < 0.94) links.push(link('#sec', 'anchor'));
      else links.push(link(self)); // self-loop
    }
    return page(route, links);
  });
}

/** Same pages and links, page order and per-page link order shuffled. */
function shuffledGraph(
  pages: RelatedPageInput[],
  rand: () => number,
): RelatedPageInput[] {
  return shuffled(pages, rand).map(p => ({
    ...p,
    links: shuffled(p.links, rand),
  }));
}

/** The fixed 5-page hop graph (a -> {c, b}; b -> {e, d}), with a's and b's
 * link declaration orders injectable to prove order invariance. */
function hopGraph(
  aLinks: CollectedLink[],
  bLinks: CollectedLink[],
): RelatedPageInput[] {
  return [
    page('/a.html', aLinks, 'A'),
    page('/b.html', bLinks, 'B'),
    page('/c.html', [], 'C'),
    page('/d.html', [], 'D'),
    page('/e.html', [], 'E'),
  ];
}

/** Key sets and every per-route entry must match exactly. */
function expectSameMap(
  actual: Map<string, RelatedLink[]>,
  expected: Map<string, RelatedLink[]>,
): void {
  expect([...actual.keys()].toSorted()).toEqual(
    [...expected.keys()].toSorted(),
  );
  for (const [k, v] of expected) expect(actual.get(k)).toEqual(v);
}

describe('buildRelatedMap order semantics', () => {
  it('breaks star ties by route asc regardless of link declaration order', () => {
    const ascending = [
      page('/a.html', [link('d.html'), link('c.html'), link('b.html')], 'A'),
      page('/b.html', [], 'B'),
      page('/c.html', [], 'C'),
      page('/d.html', [], 'D'),
    ];
    expect(
      buildRelatedMap(ascending)
        .get('/a.html')
        ?.map(r => r.route),
    ).toEqual(['/b.html', '/c.html', '/d.html']);
    const descending = [
      page('/a.html', [link('b.html'), link('c.html'), link('d.html')], 'A'),
      page('/d.html', [], 'D'),
      page('/c.html', [], 'C'),
      page('/b.html', [], 'B'),
    ];
    expect(
      buildRelatedMap(descending)
        .get('/a.html')
        ?.map(r => r.route),
    ).toEqual(['/b.html', '/c.html', '/d.html']);
  });

  it('depth 2 orders hops deterministically whatever the declaration order', () => {
    // a -> {c, b}; b -> {e, d}: hop 1 = {b, c} (refs 1), hop 2 = {d, e}
    // (refs 0); induced b-d and b-e edges ride along.
    const declared = buildRelatedMap(
      hopGraph(
        [link('c.html'), link('b.html')],
        [link('e.html'), link('d.html')],
      ),
      { depth: 2 },
    ).get('/a.html');
    const reversed = buildRelatedMap(
      hopGraph(
        [link('b.html'), link('c.html')],
        [link('d.html'), link('e.html')],
      ),
      { depth: 2 },
    ).get('/a.html');
    expect(declared).toEqual([
      {
        route: '/b.html',
        title: 'B',
        refs: 1,
        links: [
          { route: '/d.html', refs: 1 },
          { route: '/e.html', refs: 1 },
        ],
      },
      { route: '/c.html', title: 'C', refs: 1 },
      {
        route: '/d.html',
        title: 'D',
        refs: 0,
        links: [{ route: '/b.html', refs: 1 }],
      },
      {
        route: '/e.html',
        title: 'E',
        refs: 0,
        links: [{ route: '/b.html', refs: 1 }],
      },
    ]);
    expect(reversed).toEqual(declared);
  });

  it('keeps isolated pages at empty lists under every input route key', () => {
    const isolated = [
      '/lonely.html', // no links at all
      '/only-dead.html', // dead internal links only
      '/only-external.html', // external + anchor links only
      '/only-unknown.html', // internal links to missing routes
      '/only-self.html', // self-loops only
    ];
    const map = buildRelatedMap([
      page('/lonely.html', []),
      page('/only-dead.html', [link('x.html', 'internal', true)]),
      page('/only-external.html', [
        link('https://example.com', 'external'),
        link('#sec', 'anchor'),
      ]),
      page('/only-unknown.html', [link('ghost.html')]),
      page('/only-self.html', [link('only-self.html'), link('only-self.html')]),
      page('/referenced.html', [link('linked.html'), link('linked.html#x')]),
      page('/linked.html', [link('referenced.html')]),
    ]);
    // Map keys follow input order; every page yields a list, isolated ones empty.
    expect([...map.keys()]).toEqual([
      ...isolated,
      '/referenced.html',
      '/linked.html',
    ]);
    expect(map.get('/referenced.html')).toEqual([
      { route: '/linked.html', title: '/linked.html', refs: 3 },
    ]);
    expect(map.get('/linked.html')).toEqual([
      { route: '/referenced.html', title: '/referenced.html', refs: 3 },
    ]);
    for (const key of isolated) expect(map.get(key)).toEqual([]);
  });

  it('matches the naive full-scan reference on random graphs (depth 1)', () => {
    for (const seed of [1, 42, 1337]) {
      const pages = randomGraph(seeded(seed), 24);
      const expected = naiveStarMap(pages);
      const actual = buildRelatedMap(pages);
      expectSameMap(actual, expected);
      // Direct assertion keeps the vitest expect-expect rule satisfied.
      expect(actual.size).toBe(pages.length);
    }
  });

  it('output per route is invariant under page/link order shuffles', () => {
    for (const seed of [7, 99]) {
      const rand = seeded(seed);
      const pages = randomGraph(rand, 24);
      const variant = shuffledGraph(pages, rand);
      for (const depth of [1, 2, 3]) {
        const expected = buildRelatedMap(pages, { depth });
        const actual = buildRelatedMap(variant, { depth });
        expectSameMap(actual, expected);
        expect(actual.size).toBe(pages.length);
      }
    }
  });
});
