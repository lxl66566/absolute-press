import type { CollectedLink } from '../../shared/types.ts';
import type { AnchorLinkRecord } from './assets.ts';
import { linkLinesOf } from './assets.ts';

/**
 * All element ids in a rendered page's html: heading anchors, xlist entry
 * anchors, footnotes — anything the dead-anchor report must accept as a
 * fragment target.
 */
export function htmlIdsOf(html: string): Set<string> {
  const ids = new Set<string>();
  for (const m of html.matchAll(/\sid="([^"]*)"/g)) ids.add(m[1]!);
  return ids;
}

export interface DeadAnchor {
  file: string;
  raw: string;
  fragment: string;
  targetRoute: string;
  /** Source line; absent for links without a rendered line (island fragments). */
  line?: number;
}

/**
 * Dead-anchor report: cross-page fragment links whose target id is missing
 * from the target page's rendered html. Targets whose id set is unknown
 * (page not rendered / not available to the reporter) are skipped — a
 * missing report entry is safe where a false positive is not. Duplicates
 * collapse to their first occurrence; source lines join from the rendered
 * CollectedLink entries by file+raw, same as deadLinkReport.
 */
export function anchorReport(
  records: readonly AnchorLinkRecord[],
  idSetOf: (route: string) => Set<string> | undefined,
  rendered: ReadonlyArray<{ file: string; links: readonly CollectedLink[] }>,
): DeadAnchor[] {
  const lineByKey = linkLinesOf(rendered, () => true);
  const seen = new Set<string>();
  const out: DeadAnchor[] = [];
  for (const record of records) {
    const key = `${record.file}${record.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ids = idSetOf(record.targetRoute);
    if (ids === undefined) continue;
    if (ids.has(record.fragment)) continue;
    const line = lineByKey.get(key);
    out.push(line === undefined ? { ...record } : { ...record, line });
  }
  return out;
}
