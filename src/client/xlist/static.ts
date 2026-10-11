/**
 * Parse the build-time static children of an entry-list island (framework
 * `renderEntryListChildren` output): one title row (`ap-xlist__item`, title
 * cell = the `@@@` key) plus one full-width body row per entry. DOM-level
 * splitting, so `@@@` text inside entry code fences can never confuse it.
 */

export interface StaticRow {
  /** The item row (title + meta cells). */
  row: Element;
  /** The paired body row's content div, by position. */
  body: Element | undefined;
}

/**
 * Zip the static table's item rows with their body rows by position (the
 * pipeline always emits them in pairs). Shared by the XList slot parser and
 * the ExpandableList island parser so both follow one DOM contract.
 */
export function zipStaticRows(root: Element | null): StaticRow[] {
  const rows = [...(root?.querySelectorAll('.ap-xlist__item') ?? [])];
  const bodies = [...(root?.querySelectorAll('.ap-xlist__item-body') ?? [])];
  return rows.map((row, index) => ({ row, body: bodies[index] }));
}

export interface StaticEntry {
  key: string;
  bodyHtml: string;
}

export function parseStaticChildren(childrenHtml: string): StaticEntry[] {
  const doc = new DOMParser().parseFromString(childrenHtml, 'text/html');
  const root = doc.querySelector('.ap-xlist');
  return zipStaticRows(root).map(({ row, body }) => ({
    key: row.querySelector('.ap-xlist__item-title')?.textContent?.trim() ?? '',
    bodyHtml: body?.innerHTML ?? '',
  }));
}

/** Plain text of one HTML fragment (tags stripped) — search index input. */
export function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').trim();
}
