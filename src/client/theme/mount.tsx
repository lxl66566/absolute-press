import { seoPageType } from '../../shared/seo';
import type { PagePayload } from '../../shared/types';
import { disposeRoot, mountComponent } from '../dom';
import { RelatedGraph } from '../graph/RelatedGraph';
import { parseArchiveRoute } from './links';
import { ThemeContent, ThemeNav, ThemeSidebar, ThemeToc } from './Root';
import { setClientBase, setClientRoute } from './state';

// Side-effect: theme CSS must be imported here so the build collects it into
// the client bundle's css assets (shell.ts injects every bundle css href).
import '../styles/theme.css';

/**
 * Locale of the payload the persistent chrome was last mounted with (seeded
 * by mountTheme, updated by remountLocaleChrome).
 */
let mountedLocale: string | null = null;

/**
 * Wire the theme chrome into the shell containers.
 * Four separate roots; shared state lives in ./state.ts module signals.
 */
export function mountTheme(payload: PagePayload): void {
  mountedLocale = payload.site.locale;
  setClientRoute(payload.page.route);
  setClientBase(payload.site.base);
  const nav = document.getElementById('ap-nav');
  if (nav) mountComponent(ThemeNav, nav, { payload });
  const sidebar = document.getElementById('ap-sidebar');
  if (sidebar) mountComponent(ThemeSidebar, sidebar, { payload });
  const toc = document.getElementById('ap-toc');
  if (toc) mountComponent(ThemeToc, toc, { payload });
  const content = document.getElementById('ap-content');
  if (content) {
    // Chrome (feed/archive/meta) sits above the static markdown body. The
    // class is the CSS hook (the prose-tier trim keys on it); the id stays
    // the JS lookup contract.
    const slot = document.createElement('div');
    slot.id = 'ap-chrome';
    slot.className = 'ap-chrome';
    content.prepend(slot);
    mountComponent(ThemeContent, slot, { payload });
    // Archive shells carry only a bare no-JS fallback h1; the interactive
    // ArchiveView renders its own titled list, so drop the fallback.
    if (parseArchiveRoute(payload.page.route) !== null) {
      removeStaticBody(content);
    }
    upgradeMermaidFences(content);
    mountRelatedGraph(payload, content);
  }
}

/**
 * Rebuild the per-page chrome after the runtime router swapped the body:
 * TOC and the content chrome (meta row / archive / feed / footer) read the
 * page payload, so they remount with it; navbar and sidebar stay mounted
 * within one locale and track the new route through the shared clientRoute
 * signal. Crossing locales remounts them too (remountLocaleChrome).
 */
export function remountPageChrome(payload: PagePayload): void {
  remountLocaleChrome(payload);
  const toc = document.getElementById('ap-toc');
  if (toc) {
    disposeRoot(toc);
    // Disposal tears down computations but leaves the rendered nodes in
    // place; drop them so the new page's outline starts clean.
    toc.innerHTML = '';
    mountComponent(ThemeToc, toc, { payload });
  }
  const slot = document.getElementById('ap-chrome');
  if (slot) {
    disposeRoot(slot);
    slot.innerHTML = '';
    // The old footer host lives in the shell footer; drop it BEFORE the
    // remount — ThemeContent's mount effect may move the fresh host into
    // #ap-footer synchronously, and a clear afterwards would wipe it with
    // the previous page's.
    document.getElementById('ap-footer')?.replaceChildren();
    mountComponent(ThemeContent, slot, { payload });
  }
}

/**
 * Navbar and sidebar trees are per-locale (SiteStore.chromeOf) and their
 * copy resolves once per mount (useMessages is non-reactive by design —
 * each locale is its own document), so soft navigation across locales must
 * remount both roots from the new payload. Same-locale navigations keep
 * them mounted: route tracking and href depth rewriting stay reactive via
 * clientRoute/clientBase. A fresh mount re-derives drawer/sidebar state
 * from the new tree exactly like the full-page-load fallback would.
 */
function remountLocaleChrome(payload: PagePayload): void {
  if (payload.site.locale === mountedLocale) return;
  mountedLocale = payload.site.locale;
  const nav = document.getElementById('ap-nav');
  if (nav) {
    disposeRoot(nav);
    nav.innerHTML = '';
    mountComponent(ThemeNav, nav, { payload });
  }
  const sidebar = document.getElementById('ap-sidebar');
  if (sidebar) {
    disposeRoot(sidebar);
    sidebar.innerHTML = '';
    mountComponent(ThemeSidebar, sidebar, { payload });
  }
}

/** Remove every static-body child of #ap-content, keeping the chrome slot. */
export function removeStaticBody(content: HTMLElement): void {
  const slot = document.getElementById('ap-chrome');
  // Backwards walk: children is a live collection while removing.
  for (let i = content.children.length - 1; i >= 0; i--) {
    const child = content.children[i];
    if (child && child !== slot) child.remove();
  }
}

/**
 * Turn ```mermaid fences (rendered as plain highlighted code, the markdown
 * pipeline is frozen) into Mermaid island placeholders. Runs before island
 * hydration; the original code block survives as childrenHtml fallback.
 * Exported for PasswordGate, which rebuilds gated page bodies on unlock and
 * must give rebuilt fences the same treatment.
 */
export function upgradeMermaidFences(content: HTMLElement): void {
  for (const code of content.querySelectorAll<HTMLElement>(
    '.ap-code pre code.language-mermaid',
  )) {
    const wrapper = code.closest('.ap-code');
    if (!wrapper) continue;
    const chart = code.textContent ?? '';
    if (chart.trim() === '') continue;
    const slot = document.createElement('div');
    slot.dataset.apIsland = 'Mermaid';
    slot.dataset.props = JSON.stringify({ chart });
    slot.innerHTML = wrapper.innerHTML;
    wrapper.replaceWith(slot);
  }
}

/**
 * Article-tail related graph; only article pages mount it. Locale homes and
 * category/tag archives are 'website' pages per the shared seoPageType (the
 * same predicate the og:type derivation uses): homes lead with the feed or
 * prose intro, archives with the listing — neither gets a tail graph,
 * regardless of the home feed config. The build mirrors this by leaving
 * `related` off website payloads (SiteStore.payloadFor), so the payload
 * shape and this guard cannot drift apart.
 */
export function mountRelatedGraph(
  payload: PagePayload,
  content: HTMLElement,
): void {
  if (seoPageType(payload) !== 'article') return;
  if ((payload.related?.length ?? 0) === 0) return;
  const slot = document.createElement('div');
  slot.id = 'ap-related';
  // The comment section (Giscus island) is appended after the body at build
  // time; the related graph belongs above it. Only direct children qualify
  // (on gated pages the island sits inside the gate wrapper and we keep the
  // plain append, outside the gate).
  const comments = content.querySelector<HTMLElement>(
    ':scope > div[data-ap-island="Giscus"]',
  );
  if (comments) content.insertBefore(slot, comments);
  else content.append(slot);
  mountComponent(RelatedGraph, slot, { payload });
}
