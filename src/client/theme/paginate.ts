/** Total page count (0 when there is nothing to page). */
export function pageCount(total: number, perPage: number): number {
  if (perPage <= 0 || total <= 0) return 0;
  return Math.ceil(total / perPage);
}

/** Clamp a 1-based page number into [1, count]; count <= 0 yields 1. */
export function clampPage(page: number, count: number): number {
  if (count <= 0) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), count);
}

/** Slice a 1-based page out of items (page is clamped first). */
export function paginate<T>(
  items: readonly T[],
  page: number,
  perPage: number,
): T[] {
  const current = clampPage(page, pageCount(items.length, perPage));
  return items.slice((current - 1) * perPage, current * perPage);
}

export type PageItem = number | 'gap';

/**
 * Compact page list for pagination UI: full list up to 7 pages,
 * otherwise first/last plus a window around the current page.
 */
export function pageItems(page: number, count: number): PageItem[] {
  if (count <= 0) return [];
  const current = clampPage(page, count);
  if (count <= 7) {
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const items: PageItem[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  if (start > 2) items.push('gap');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < count - 1) items.push('gap');
  items.push(count);
  return items;
}
