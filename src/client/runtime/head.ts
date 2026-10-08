import { seoPageType } from '../../shared/seo';
import type { PagePayload } from '../../shared/types';
import { pagePayload } from './payload';

/**
 * Head sync across soft navigation: the SSG stamps every page's head meta
 * at build time, but applyPage() only swaps the body — canonical, og tags
 * and the description would keep pointing at the previous page. The patch
 * derivation is a pure function so tests pin it against the shell output;
 * applyHead() touches only tags the shell actually emits (a missing tag
 * stays missing, nothing is invented).
 */

/** Desired head values for one fetched page payload. */
export interface HeadPatch {
  /** Composed document title, mirrored into og:title. */
  ogTitle: string;
  /** meta description / og:description content (page excerpt first). */
  description: string;
  /** canonical + og:url absolute URL. */
  canonical: string;
  ogType: 'website' | 'article';
  /**
   * hreflang links to rebuild, in payload order; the first entry doubles as
   * the x-default target (default-locale version when it exists).
   */
  alternates: { lang: string; href: string }[];
}

/**
 * Canonical URL prefix (origin plus any deploy subpath) for one page: its
 * SSG canonical by construction ends with its route. Pure for tests.
 */
export function canonicalPrefixOf(
  canonical: string | undefined,
  route: string | undefined,
  origin: string,
): string {
  return canonical !== undefined &&
    route !== undefined &&
    canonical.endsWith(route)
    ? canonical.slice(0, canonical.length - route.length)
    : origin;
}

let urlPrefix: string | undefined;

/**
 * Capture the canonical URL prefix from the initial page. Must run at
 * startup: after a navigation the payload script already describes the
 * target page while the canonical link still shows the source page. The
 * shell composes canonical/og:url from the config hostname, which may
 * carry a deploy subpath (`https://x.github.io/blog`) — location.origin
 * alone would drop it (the payload deliberately carries no hostname).
 */
export function initCanonicalPrefix(): void {
  urlPrefix = canonicalPrefixOf(
    document.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
      undefined,
    pagePayload()?.page.route,
    location.origin,
  );
}

/** The captured prefix; location.origin until initCanonicalPrefix runs. */
export function canonicalPrefix(): string {
  return urlPrefix ?? location.origin;
}

/**
 * Derive the head updates a payload implies, against the canonical URL
 * prefix (see initCanonicalPrefix).
 */
export function headPatchOf(
  payload: PagePayload,
  urlPrefix: string,
  title: string,
): HeadPatch {
  return {
    ogTitle: title,
    description: payload.page.excerpt ?? payload.site.description,
    canonical: `${urlPrefix}${payload.page.route}`,
    ogType: seoPageType(payload),
    alternates: (payload.page.alternates ?? []).map(a => ({
      lang: a.lang,
      href: `${urlPrefix}${a.route}`,
    })),
  };
}

/** Set an attribute when the element exists; absent tags stay absent. */
function setAttr(
  el: Element | null,
  attr: 'content' | 'href',
  value: string,
): void {
  el?.setAttribute(attr, value);
}

/**
 * Apply the patch to the live document. JSON-LD is deliberately not synced:
 * the ld+json block needs the configured author identity, which the payload
 * does not carry, and only crawlers consume it — they never soft-navigate.
 * The hreflang set differs per page,
 * so it is rebuilt in place (dropped entirely for pages without
 * counterparts, matching a shell that emitted none); the RSS alternate link
 * carries no hreflang attribute and never matches the selector.
 */
export function applyHead(patch: HeadPatch, doc: Document): void {
  setAttr(
    doc.querySelector('meta[name="description"]'),
    'content',
    patch.description,
  );
  setAttr(doc.querySelector('link[rel="canonical"]'), 'href', patch.canonical);
  setAttr(
    doc.querySelector('meta[property="og:title"]'),
    'content',
    patch.ogTitle,
  );
  setAttr(
    doc.querySelector('meta[property="og:description"]'),
    'content',
    patch.description,
  );
  setAttr(
    doc.querySelector('meta[property="og:url"]'),
    'content',
    patch.canonical,
  );
  setAttr(
    doc.querySelector('meta[property="og:type"]'),
    'content',
    patch.ogType,
  );

  const head = doc.querySelector('head');
  if (!head) return;
  for (const el of Array.from(
    doc.querySelectorAll('link[rel="alternate"][hreflang]'),
  )) {
    el.remove();
  }
  // The shell emits the set only for pages with two or more counterparts;
  // a lone entry must not appear here either (SSG parity).
  if (patch.alternates.length <= 1) return;
  // Insert right after the canonical link (the shell's hreflang position):
  // every link goes before the same original reference, so the payload
  // order is preserved; without a canonical the links append to head.
  const canonical = doc.querySelector('link[rel="canonical"]');
  const reference: Node | null = canonical ? canonical.nextSibling : null;
  for (const alternate of patch.alternates) {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'alternate');
    link.setAttribute('hreflang', alternate.lang);
    link.setAttribute('href', alternate.href);
    head.insertBefore(link, reference);
  }
  const xDefault = doc.createElement('link');
  xDefault.setAttribute('rel', 'alternate');
  xDefault.setAttribute('hreflang', 'x-default');
  xDefault.setAttribute('href', patch.alternates[0]!.href);
  head.insertBefore(xDefault, reference);
}
