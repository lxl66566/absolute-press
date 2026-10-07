/**
 * Shared HTML escaping for the build-time HTML assemblers (shell head, site
 * payload decorations, island props, xlist cells). One implementation instead
 * of drifting per-module copies — this is the injection-safety path, so the
 * exact semantics are pinned:
 * - `&` first, then `<`, `>`: always (wrong order would double-escape);
 * - `"` by default (`attr`): every template here quotes attribute values
 *   with `"`; pass `{ attr: false }` for pure text nodes where quotes are
 *   inert and were historically not escaped;
 * - `'` is never escaped: no template uses single-quoted attributes.
 */
export function escapeHtml(
  s: string,
  { attr = true }: { attr?: boolean } = {},
): string {
  const escaped = s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return attr ? escaped.replaceAll('"', '&quot;') : escaped;
}
