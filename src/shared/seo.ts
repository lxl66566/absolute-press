import type { PagePayload } from './types.ts';

/** og:type of a payload page: locale homes and category/tag archives are
 * 'website', every other page is 'article'. */
export type SeoPageType = 'website' | 'article';

export interface ArchiveRoute {
  kind: 'category' | 'tag';
  name: string;
}

/** Parse `/category/<name>.html` / `/tag/<name>.html` (locale prefix allowed). */
export function parseArchiveRoute(route: string): ArchiveRoute | null {
  const match = /\/(category|tag)\/([^/]+)\.html$/.exec(route);
  const raw = match?.[2];
  if (!match || !raw) return null;
  return {
    kind: match[1] === 'tag' ? 'tag' : 'category',
    name: decodeURIComponent(raw),
  };
}

/**
 * og:type derivation shared by the build-time shell and the client router's
 * soft-navigation head sync, so a client-side page swap can never diverge
 * from the SSG output. Home pages are recognized by route (payloads carry
 * no relPath): the current locale's `/index.html`; archives are the
 * synthetic listing routes; everything else is an article.
 */
export function seoPageType(payload: PagePayload): SeoPageType {
  if (parseArchiveRoute(payload.page.route) !== null) return 'website';
  const prefix =
    payload.site.locales.find(l => l.key === payload.site.locale)?.prefix ?? '';
  return payload.page.route === `${prefix}/index.html` ? 'website' : 'article';
}
