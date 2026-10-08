/**
 * Link classification shared by the node build (markdown rules, navbar
 * route validation) and the client theme (render-time base/target). Pure
 * string predicates: no DOM or node imports, so both sides consume one
 * definition. Node-side importers need the explicit `.ts` specifier (plain
 * node ESM type-stripping).
 */

/** URI scheme prefix (`https:`, `mailto:`, `tel:`, ...); case-insensitive. */
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** True when `href` opens with a URI scheme (`mailto:x@y`, `tel:+1`, ...). */
export function hasUriScheme(href: string): boolean {
  return SCHEME_RE.test(href);
}

/**
 * True for any href that is not a site-internal path: it carries a URI
 * scheme (any of them — the old mailto/tel whitelist is subsumed) or is
 * protocol-relative (`//host/x`). Internal shapes never match: anchors
 * (`#f`), site-absolute (`/a/b`), relative (`./x`, `../x`, `a/b`) and
 * query-only (`?x`).
 *
 * Callers lean on exactly this semantic:
 * - node nav-tree: such links can never be a site route, so curated-item
 *   validation skips them;
 * - client theme: such links must not get the relative base prefix and keep
 *   their native navigation (external target).
 * Before this module the two sides drifted (the client whitelisted mailto/tel
 * instead of reading any scheme, mangling exotic opaque ones with the base).
 */
export function isExternalHref(href: string): boolean {
  return SCHEME_RE.test(href) || href.startsWith('//');
}

/**
 * Join a site route ('/a/b') with the per-page relative base ('', '../').
 * The home route '/' joins to the bare base; when that is '' (the current
 * page IS the home page) emit './' — an empty href would mean the current
 * page per HTML semantics, which is the same target, but './' also works
 * when the link is rendered into another page's DOM (e.g. drawer chrome).
 */
export function withBase(base: string, route: string): string {
  const joined = base + route.replace(/^\/+/, '');
  return joined === '' ? './' : joined;
}
