/**
 * Normalize a route for MATCHING (navExclude prefixes, encrypt rules):
 * percent-decode and collapse duplicate slashes. Emitted routes stay in
 * their encoded form; only comparisons run through this, so config-side
 * patterns may be written as plain unencoded paths (`/标签` instead of
 * `/%E6%A0%87%E7%AD%BE`).
 */
export function normalizeRouteForMatch(route: string): string {
  let decoded = route;
  try {
    decoded = decodeURIComponent(route);
  } catch {
    // Malformed percent sequences compare as-is; a user-side pattern typo
    // must not crash the build.
  }
  const collapsed = decoded.replace(/\/{2,}/g, '/');
  return `/${collapsed.replace(/^\/+|\/+$/g, '')}`;
}
