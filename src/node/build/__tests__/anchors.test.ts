import { describe, expect, it } from 'vitest';

import type { CollectedLink } from '../../../shared/types.ts';
import { htmlIdsOf, anchorReport } from '../anchors.ts';
import type { AnchorLinkRecord } from '../assets.ts';

function linksOf(raw: string, line?: number): CollectedLink[] {
  return [{ raw, resolved: raw, kind: 'internal', dead: false, line }];
}

describe('htmlIdsOf', () => {
  it('collects every id attribute, duplicates collapsing', () => {
    const html =
      '<h1 id="title">T</h1>' +
      '<h6 id="entry" class="ap-xlist__entry-anchor">E</h6>' +
      '<div id="fn-1">footnote</div>' +
      '<div id="entry">dup</div>';
    expect(htmlIdsOf(html)).toEqual(new Set(['title', 'entry', 'fn-1']));
  });

  it('returns an empty set for id-less html', () => {
    expect(htmlIdsOf('<p>plain</p>')).toEqual(new Set());
  });
});

describe('anchorReport', () => {
  const A = '/content/a.md';
  const record = (
    fragment: string,
    raw: string,
    route = '/b',
  ): AnchorLinkRecord => ({
    file: A,
    raw,
    targetRoute: route,
    fragment,
  });

  it('reports a fragment missing from the target page', () => {
    const ids = new Set(['present']);
    expect(
      anchorReport([record('missing', './b.md#missing')], () => ids, []),
    ).toEqual([
      {
        file: A,
        raw: './b.md#missing',
        targetRoute: '/b',
        fragment: 'missing',
      },
    ]);
  });

  it('keeps a link whose target id exists', () => {
    const ids = new Set(['present']);
    expect(
      anchorReport([record('present', './b.md#present')], () => ids, []),
    ).toEqual([]);
  });

  it('skips records whose target page id set is unknown', () => {
    const ids: Record<string, Set<string>> = { '/b': new Set(['gone']) };
    const idSetOf = (route: string): Set<string> | undefined => ids[route];
    const records = [
      // Known id set, id present: kept.
      record('gone', './b.md#gone'),
      // Target route without a rendered id set: conservative skip.
      record('x', './c.md#x', '/c'),
    ];
    expect(anchorReport(records, idSetOf, [])).toEqual([]);
  });

  it('dedupes by file+raw, keeping the first occurrence', () => {
    const ids = new Set<string>();
    const records = [
      record('gone', './b.md#gone'),
      record('gone', './b.md#gone'),
    ];
    expect(anchorReport(records, () => ids, [])).toEqual([
      {
        file: A,
        raw: './b.md#gone',
        targetRoute: '/b',
        fragment: 'gone',
      },
    ]);
  });

  it('joins the source line from the rendered links by file+raw', () => {
    const ids = new Set<string>();
    const rendered = [{ file: A, links: linksOf('./b.md#gone', 7) }];
    const out = anchorReport(
      [record('gone', './b.md#gone')],
      () => ids,
      rendered,
    );
    expect(out).toEqual([
      {
        file: A,
        raw: './b.md#gone',
        targetRoute: '/b',
        fragment: 'gone',
        line: 7,
      },
    ]);
  });

  it('reports without a line when no render result carries one', () => {
    const ids = new Set<string>();
    // Island-inner links collect without a line.
    const rendered = [{ file: A, links: linksOf('./b.md#gone') }];
    const out = anchorReport(
      [record('gone', './b.md#gone')],
      () => ids,
      rendered,
    );
    expect(out).toEqual([
      {
        file: A,
        raw: './b.md#gone',
        targetRoute: '/b',
        fragment: 'gone',
      },
    ]);
  });
});
