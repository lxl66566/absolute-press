import type { PagePayload } from './types.ts';

/** og:type of a payload page: locale homes and category/tag archives are
 * 'website', every other page is 'article'. */
export type SeoPageType = 'website' | 'article';

export interface ArchiveRoute {
  kind: 'category' | 'tag';
  name: string;
}

/** Parse `/category/<name>` / `/tag/<name>` (locale prefix allowed). */
export function parseArchiveRoute(route: string): ArchiveRoute | null {
  const match = /\/(category|tag)\/([^/]+)$/.exec(route);
  const raw = match?.[2];
  if (!match || !raw) return null;
  return {
    kind: match[1] === 'tag' ? 'tag' : 'category',
    name: decodeURIComponent(raw),
  };
}

/**
 * True when the page is its own locale's built-in listing page (config
 * `pages`). The payload's `site.pages` carries the exact canonical routes
 * per enabled page, so the comparison needs no locale-prefix parsing and a
 * content page occupying a listing-shaped route while that page is
 * disabled stays an article.
 */
export function isListingPage(payload: PagePayload): boolean {
  const pages = payload.site.pages;
  if (!pages) return false;
  const { route } = payload.page;
  return (
    route === pages.timeline ||
    route === pages.categories ||
    route === pages.tags
  );
}

/**
 * og:type derivation shared by the build-time shell and the client router's
 * soft-navigation head sync, so a client-side page swap can never diverge
 * from the SSG output. Home pages are recognized by route (payloads carry
 * no relPath): the current locale's `<prefix>/`; archives and the built-in
 * listing pages are the synthetic listing routes; everything else is an
 * article.
 */
export function seoPageType(payload: PagePayload): SeoPageType {
  if (parseArchiveRoute(payload.page.route) !== null) return 'website';
  if (isListingPage(payload)) return 'website';
  const prefix =
    payload.site.locales.find(l => l.key === payload.site.locale)?.prefix ?? '';
  return payload.page.route === `${prefix}/` ? 'website' : 'article';
}
