/**
 * Scroll policy for soft navigation, kept free of DOM access so the
 * decision logic is unit-testable; the router applies a decision to the
 * live document.
 */

/** State this router stores on history entries. `apScroll` is untrusted —
 * history.state returns whatever was stored — and validated at runtime. */
export interface RouterEntryState {
  apScroll?: unknown;
}

/** Where an arriving page should be scrolled. */
export type ScrollDecision =
  | { kind: 'restored'; y: number }
  | { kind: 'anchor' }
  | { kind: 'top' };

/**
 * Decide the scroll for a history entry: on traversal, from its stored
 * state and URL hash; with a null state — what a fresh pushState entry
 * has — for a just-pushed URL. A saved offset wins (the entry was left
 * mid-scroll and a native traversal would put it back); otherwise a hash
 * re-anchors like a native MPA jump; anything else starts at the top.
 */
export function resolveScrollTarget(
  state: RouterEntryState | null | undefined,
  hash: string,
): ScrollDecision {
  const saved = state?.apScroll;
  if (typeof saved === 'number') return { kind: 'restored', y: saved };
  if (hash !== '') return { kind: 'anchor' };
  return { kind: 'top' };
}
