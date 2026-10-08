import { describe, expect, it } from 'vitest';

import type { PagePayload, RelatedLink } from '../../../shared/types';
import {
  adjacencyMap,
  defaultLabelSet,
  edgeOpacity,
  edgeWidth,
  FIT_MAX_K,
  fitTransform,
  graphLabel,
  LABEL_OVERHANG,
  nodeExtent,
  toGraphData,
} from '../layout';

const PAGE = { route: '/a', locale: 'zh', title: 'A' } as const;

function payload(related: RelatedLink[]): PagePayload {
  // Only the fields toGraphData reads; the rest is irrelevant here.
  return {
    site: {
      title: 't',
      description: '',
      base: '',
      locales: [],
      locale: 'zh',
    },
    navbar: [],
    sidebar: [],
    page: {
      ...PAGE,
      headings: [],
      frontmatter: {},
      createdAt: null,
      updatedAt: null,
    },
    related,
  };
}

describe('edgeWidth', () => {
  it('is 1px at one ref and grows by 0.75px per extra ref', () => {
    expect(edgeWidth(1)).toBe(1);
    expect(edgeWidth(2)).toBe(1.75);
    expect(edgeWidth(3)).toBe(2.5);
  });

  it('caps at 4px and tolerates zero/negative refs', () => {
    expect(edgeWidth(0)).toBe(1);
    expect(edgeWidth(-3)).toBe(1);
    expect(edgeWidth(5)).toBe(4);
    expect(edgeWidth(100)).toBe(4);
  });
});

describe('edgeOpacity', () => {
  it('rises with refs and stays in [0.3, 0.85]', () => {
    expect(edgeOpacity(1)).toBe(0.3);
    expect(edgeOpacity(5)).toBe(0.74);
    expect(edgeOpacity(100)).toBe(0.85);
  });
});

describe('graphLabel', () => {
  it('keeps short titles and truncates long ones with an ellipsis', () => {
    expect(graphLabel('Short')).toBe('Short');
    const long = 'a'.repeat(30);
    expect(graphLabel(long)).toBe(`${'a'.repeat(25)}…`);
    expect(graphLabel(long)).toHaveLength(26);
  });
});

describe('toGraphData', () => {
  it('builds the star: current page + neighbors, one edge each', () => {
    const data = toGraphData(
      payload([
        { route: '/b', title: 'B', refs: 3 },
        { route: '/c', title: 'C', refs: 1 },
      ]),
    );
    expect(data.nodes.map(n => [n.id, n.current])).toEqual([
      ['/a', true],
      ['/b', false],
      ['/c', false],
    ]);
    expect(data.edges).toEqual([
      {
        sourceId: '/a',
        targetId: '/b',
        refs: 3,
        source: '/a',
        target: '/b',
      },
      {
        sourceId: '/a',
        targetId: '/c',
        refs: 1,
        source: '/a',
        target: '/c',
      },
    ]);
  });

  it('dedupes induced links listed on both endpoints', () => {
    const data = toGraphData(
      payload([
        {
          route: '/b',
          title: 'B',
          refs: 1,
          links: [{ route: '/c', refs: 4 }],
        },
        {
          route: '/c',
          title: 'C',
          refs: 1,
          links: [{ route: '/b', refs: 4 }],
        },
      ]),
    );
    const pairs = data.edges
      .map(e => [e.sourceId, e.targetId].toSorted().join('~'))
      .toSorted();
    expect(pairs).toEqual(['/a~/b', '/a~/c', '/b~/c']);
    expect(data.edges.find(e => e.refs === 4)?.targetId).toBe('/c');
  });

  it('omits the star edge for zero-refs (second-hop) members', () => {
    // depth-2 payloads list multi-hop members with refs 0; they connect
    // through their bridge edges only.
    const data = toGraphData(
      payload([
        {
          route: '/b',
          title: 'B',
          refs: 1,
          links: [{ route: '/c', refs: 2 }],
        },
        {
          route: '/c',
          title: 'C',
          refs: 0,
          links: [{ route: '/b', refs: 2 }],
        },
      ]),
    );
    const pairs = data.edges
      .map(e => [e.sourceId, e.targetId].toSorted().join('~'))
      .toSorted();
    expect(pairs).toEqual(['/a~/b', '/b~/c']);
  });

  it('handles empty related lists and ignores self-edges', () => {
    expect(toGraphData(payload([])).edges).toEqual([]);
    const data = toGraphData(
      payload([
        {
          route: '/b',
          title: 'B',
          refs: 1,
          // Malformed payload must not create a self-loop edge.
          links: [{ route: '/b', refs: 9 }],
        },
      ]),
    );
    expect(data.edges).toEqual([
      {
        sourceId: '/a',
        targetId: '/b',
        refs: 1,
        source: '/a',
        target: '/b',
      },
    ]);
  });
});

describe('adjacencyMap', () => {
  it('is undirected', () => {
    const adj = adjacencyMap([
      {
        sourceId: '/a',
        targetId: '/b',
        refs: 1,
        source: '/a',
        target: '/b',
      },
    ]);
    expect(adj.get('/a')?.has('/b')).toBe(true);
    expect(adj.get('/b')?.has('/a')).toBe(true);
    expect(adj.get('/a')?.has('/c') ?? false).toBe(false);
  });
});

describe('defaultLabelSet', () => {
  const edges = [
    {
      sourceId: '/a',
      targetId: '/b',
      refs: 1,
      source: '/a',
      target: '/b',
    },
    {
      sourceId: '/a',
      targetId: '/c',
      refs: 1,
      source: '/a',
      target: '/c',
    },
    {
      sourceId: '/b',
      targetId: '/d',
      refs: 1,
      source: '/b',
      target: '/d',
    },
  ];

  it('labels the current page and its one-hop neighbors only', () => {
    // /d is two hops away (a-b-d): its label stays hidden by default.
    expect(defaultLabelSet('/a', edges)).toEqual(new Set(['/a', '/b', '/c']));
  });

  it('labels nothing beyond the current dot when it has no edges', () => {
    expect(defaultLabelSet('/z', edges)).toEqual(new Set(['/z']));
  });
});

const extNode = (id: string, x: number, y: number, r = 4) => ({
  id,
  title: id,
  route: id,
  current: false,
  r,
  x,
  y,
});

describe('nodeExtent', () => {
  it('unions node circles; labels pad both horizontal edges', () => {
    // Labels anchor left or right depending on which half of the canvas a
    // dot sits on (chart.ts), so the extent reserves overhang on both sides.
    const extent = nodeExtent([extNode('/a', 0, 0), extNode('/b', 50, 30)]);
    expect(extent).toEqual({
      minX: -4 - LABEL_OVERHANG,
      minY: -4,
      maxX: 50 + 4 + LABEL_OVERHANG,
      maxY: 30 + 4,
    });
  });

  it('can skip the label overhang', () => {
    const extent = nodeExtent([extNode('/a', 10, 20)], false);
    expect(extent).toEqual({ minX: 6, minY: 16, maxX: 14, maxY: 24 });
  });

  it('returns null when nothing is placed yet', () => {
    expect(nodeExtent([])).toBeNull();
    expect(nodeExtent([{ ...extNode('/a', 1, 1), x: undefined }])).toBeNull();
  });
});

describe('fitTransform', () => {
  it('centers and scales a graph to fit with padding', () => {
    // 300x200 graph into 640x360 with 48px padding: k = min(544/300, 264/200).
    const fit = fitTransform(
      { minX: 0, minY: 0, maxX: 300, maxY: 200 },
      640,
      360,
    );
    expect(fit.k).toBeCloseTo(1.32, 5);
    expect(fit.x).toBeCloseTo(320 - 1.32 * 150, 5);
    expect(fit.y).toBeCloseTo(180 - 1.32 * 100, 5);
  });

  it('caps the scale for sparse graphs', () => {
    const fit = fitTransform(
      { minX: 0, minY: 0, maxX: 50, maxY: 50 },
      640,
      360,
    );
    expect(fit.k).toBe(FIT_MAX_K);
  });

  it('shrinks below 1 for oversized graphs', () => {
    const fit = fitTransform(
      { minX: 0, minY: 0, maxX: 2000, maxY: 2000 },
      640,
      360,
    );
    expect(fit.k).toBeCloseTo(264 / 2000, 5);
  });

  it('treats a zero-size extent as a point (clamped by the cap)', () => {
    const fit = fitTransform({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 640, 360);
    expect(fit.k).toBe(FIT_MAX_K);
    expect(fit.x).toBeCloseTo(320 - FIT_MAX_K * 5, 5);
  });
});
