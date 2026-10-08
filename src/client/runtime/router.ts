import type { PagePayload } from '../../shared/types';
import { disposeRootsUnder } from '../dom';
import {
  anchorTargetElement,
  flashAnchorTarget,
} from '../theme/anchor-highlight';
import { parseArchiveRoute } from '../theme/links';
import {
  mountRelatedGraph,
  remountPageChrome,
  removeStaticBody,
  upgradeMermaidFences,
} from '../theme/mount';
import { setClientBase, setClientRoute } from '../theme/state';
import {
  applyHead,
  canonicalPrefix,
  headPatchOf,
  initCanonicalPrefix,
} from './head';
import { hydrateIslands } from './islands';
import type { RouterEntryState, ScrollDecision } from './scroll-restore';
import { resolveScrollTarget } from './scroll-restore';
import { initTabsPersistence } from './tabs';

/**
 * Client-side navigation over the static MPA pages: intercept same-site
 * link clicks, fetch the target HTML, swap #ap-content's body, and update
 * the persistent chrome — navbar and sidebar track the route through the
 * shared clientRoute signal (a locale crossing remounts them, see
 * remountLocaleChrome), TOC and the content chrome remount with the new
 * payload. Full page loads stay the fallback: any failure (network,
 * missing payload, unknown page shape) falls back to a native navigation,
 * so the site never breaks.
 */

/** Monotonic navigation id: only the latest fetch may swap the page. */
let navSeq = 0;

/** Links the router handles; everything else keeps native behavior. */
function isRoutable(a: HTMLAnchorElement): boolean {
  if (a.origin !== location.origin) return false;
  if (a.protocol !== 'http:' && a.protocol !== 'https:') return false;
  if (a.target !== '' && a.target !== '_self') return false;
  if (a.hasAttribute('download')) return false;
  const href = a.getAttribute('href') ?? '';
  // Hash-only links stay in the document (TOC / anchor jumps).
  if (href === '' || href.startsWith('#')) return false;
  // Asset URLs (images, downloads, ...) have a non-HTML final segment;
  // page URLs are extensionless clean routes (legacy .html stays routable).
  const last = a.pathname.split('/').pop() ?? '';
  if (last.includes('.') && !/\.html?$/i.test(last)) return false;
  return true;
}

/** Apply a fetched page to the live document. */
function applyPage(
  payload: PagePayload,
  incoming: Element,
  title: string,
  /** Raw payload JSON of the fetched page, kept for the live script. */
  rawJson: string,
): void {
  const content = document.getElementById('ap-content');
  if (!content) return;
  const chrome = document.getElementById('ap-chrome');

  // Islands and per-page graphs under the body die with it; the chrome
  // slot is excluded (remountPageChrome rebuilds it).
  disposeRootsUnder(content, chrome);
  // Drop the previous body, then insert the new one (archive shells carry
  // only a bare no-JS fallback; ArchiveView owns the page).
  removeStaticBody(content);
  if (parseArchiveRoute(payload.page.route) === null) {
    const fragment = document.createDocumentFragment();
    // Array.from: appending moves each node and mutates the live collection.
    for (const child of Array.from(incoming.children)) fragment.append(child);
    if (chrome) chrome.after(fragment);
    else content.prepend(fragment);
  }

  upgradeMermaidFences(content);
  mountRelatedGraph(payload, content);
  // Keep the payload script in sync: pagePayload() readers (site islands)
  // must see the navigated page's data, not the previous page's.
  const dataEl = document.getElementById('__AP_DATA__');
  if (dataEl) dataEl.textContent = rawJson;
  // Navbar / sidebar track the route reactively and rewrite their
  // page-relative hrefs for the new depth; TOC and the content chrome
  // rebuild for the new page.
  setClientRoute(payload.page.route);
  setClientBase(payload.site.base);
  remountPageChrome(payload);
  document.title = title;
  // <html lang> is stamped per page by the shell; soft navigation must keep
  // it in step across locales (CSS :lang, hyphenation and screen readers).
  const locale = payload.site.locales.find(l => l.key === payload.site.locale);
  if (locale) document.documentElement.lang = locale.lang;
  // The SSG-composed head meta (description/canonical/og tags/hreflang)
  // must track the navigated page too, or it keeps describing the previous
  // one; applyHead only touches tags the shell emits.
  applyHead(headPatchOf(payload, canonicalPrefix(), title), document);

  initTabsPersistence();
  hydrateIslands(content);
}

/** Apply a scroll decision to the live document. An anchor resolves against
 * the already-swapped DOM and keeps the heading scroll-margin-top offset
 * shared with TOC jumps; a broken anchor falls back to the top like a
 * native MPA load would. */
function applyScrollTarget(decision: ScrollDecision, hash: string): void {
  if (decision.kind === 'restored') {
    window.scrollTo(0, decision.y);
    return;
  }
  if (decision.kind === 'anchor') {
    const el = anchorTargetElement(hash);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      return;
    }
  }
  window.scrollTo(0, 0);
}

async function navigate(href: string, push: boolean): Promise<void> {
  const seq = ++navSeq;
  let page: {
    payload: PagePayload;
    content: Element;
    title: string;
    /** Raw payload JSON of the fetched page (kept for the live script). */
    rawJson: string;
  };
  try {
    const response = await fetch(href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const doc = new DOMParser().parseFromString(
      await response.text(),
      'text/html',
    );
    const data = doc.getElementById('__AP_DATA__')?.textContent;
    const incoming = doc.getElementById('ap-content');
    if (data === undefined || data === '' || incoming === null)
      throw new Error('payload missing');
    page = {
      payload: JSON.parse(data) as PagePayload,
      content: incoming,
      title: doc.title,
      rawJson: data,
    };
  } catch {
    // Router cannot serve this URL — fall back to a full load. A stale
    // attempt (another navigation started meanwhile) just dies quietly.
    if (seq === navSeq) location.href = href;
    return;
  }
  if (seq !== navSeq) return;
  applyPage(page.payload, page.content, page.title, page.rawJson);

  if (push) {
    // Stamp the leaving page's offset onto its own entry BEFORE pushing:
    // riding on the new entry shifted every restore one entry back (the
    // page you left came back as 0).
    const left = history.state as RouterEntryState | null;
    history.replaceState({ ...left, apScroll: window.scrollY }, '');
    history.pushState(null, '', href);
    // A fresh entry carries no saved offset: a hash lands on its anchor
    // like a native MPA jump, anything else starts at the top.
    applyScrollTarget(resolveScrollTarget(null, location.hash), location.hash);
  }
  // After the history update (pushState, or the browser's own popstate
  // entry switch), so location and document.title describe the new page.
  reportPageView();
  // A pushed URL may carry a hash; anchor flash mirrors a native jump.
  if (location.hash !== '') flashAnchorTarget(location.hash);
}

/**
 * Programmatic soft navigation for UI without an anchor to click (the
 * related-graph nodes): same fetch-and-swap as link clicks, same
 * full-load fallback when the router cannot serve the URL.
 */
export function navigateTo(href: string): void {
  void navigate(href, true);
}

/** GA's event call signature (the gtag.js global). */
type Gtag = (
  command: 'event',
  name: string,
  params: Record<string, string>,
) => void;

/**
 * GA page_view for a completed soft navigation. The initial load is already
 * counted by the shell's `gtag('config', …)` bootstrap — reporting it here
 * too would double-count — but a soft navigation swaps the page without a
 * reload, which gtag never sees on its own. Sites without GA have no
 * window.gtag and skip this.
 */
function reportPageView(): void {
  const gtag: unknown = (window as { gtag?: unknown }).gtag;
  if (typeof gtag !== 'function') return;
  (gtag as Gtag)('event', 'page_view', {
    page_title: document.title,
    page_location: location.href,
    page_path: location.pathname + location.search,
  });
}

function onClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const a = target.closest<HTMLAnchorElement>('a[href]');
  if (!a || !isRoutable(a)) return;
  // Same-document links never swap: hash links keep native (or TOC)
  // anchor behavior, bare current-URL links scroll back to the top.
  if (a.pathname === location.pathname && a.search === location.search) {
    if (a.hash === '') {
      event.preventDefault();
      window.scrollTo(0, 0);
    }
    return;
  }
  event.preventDefault();
  void navigate(a.href, true);
}

function onPopState(): void {
  // Read before the async swap: history.state and location already
  // describe the entry being returned to, and navigate() changes neither.
  const hash = location.hash;
  const decision = resolveScrollTarget(history.state, hash);
  void navigate(location.href, false).then(() => {
    applyScrollTarget(decision, hash);
    // flashAnchorTarget returns void; spell the return out for the lint
    // rule that wants every then() to return.
    return hash === '' ? undefined : flashAnchorTarget(hash);
  });
}

/** Runtime init: take over same-site link navigation. */
export function initRouter(): void {
  initCanonicalPrefix();
  document.addEventListener('click', onClick);
  window.addEventListener('popstate', onPopState);
}
