import { isExternalHref, withBase } from '../../shared/links';
import type { PagePayload } from '../../shared/types';

// Single shared predicate (any scheme or protocol-relative = external) and
// the base join, both defined in shared/links (node build components consume
// them too); re-exported here so link consumers keep one import site.
export { isExternalHref, withBase };

/** Current-route match tolerant of a trailing slash ('/guide/' vs '/guide'). */
const normalizeRoute = (r: string): string => {
  const stripped = r.replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
};

export function isActiveRoute(link: string, route: string): boolean {
  return normalizeRoute(link) === normalizeRoute(route);
}

/** Remove the current locale prefix so another locale's prefix can be prepended. */
export function stripLocalePrefix(route: string, prefix: string): string {
  const stripped =
    prefix !== '' && route.startsWith(prefix)
      ? route.slice(prefix.length)
      : route;
  return stripped === '' || stripped === '/' ? '/' : stripped;
}

/** Route prefix ('' for the default locale, '/en' etc) of the payload's locale. */
export function localePrefixOf(site: PagePayload['site']): string {
  return site.locales.find(l => l.key === site.locale)?.prefix ?? '';
}

// The parser lives in shared/seo.ts: the build-time shell needs it for the
// og:type derivation; re-exported here for the theme's other consumers.
export { parseArchiveRoute, type ArchiveRoute } from '../../shared/seo.ts';

/**
 * Archive page href for a category/tag chip. Archives are grouped per
 * locale (`/en/tag/x`), so the current page's locale prefix must ride
 * along or non-default-locale chips land on a foreign (often missing) page.
 */
export function archiveHref(
  base: string,
  localePrefix: string,
  kind: 'category' | 'tag',
  name: string,
): string {
  return withBase(base, `${localePrefix}/${kind}/${encodeURIComponent(name)}`);
}
