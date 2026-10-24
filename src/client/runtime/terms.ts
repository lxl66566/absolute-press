/**
 * Term-reference popovers: `[[id]]` renders as `<span class="ap-term">`
 * (build time). The definition bodies ship either as `<template
 * class="ap-term-def">` elements appended to the page (dev), or — on build
 * pages — as a per-page content-hashed ES module referenced by the payload
 * `refs` field (build/refs-asset.ts): full ref articles would bloat every
 * document, and popovers open only on demand. An IntersectionObserver starts
 * the fetch when the first term nears the viewport (primeTermPrefetch), so
 * the data is typically in before the first hover; a hover that wins the
 * race simply awaits the same in-flight load.
 *
 * The popover itself is lazily created, hosted inside #ap-content so the
 * prose styles (scoped there) cover its markdown body. Delegated events at
 * document level cover spans arriving after load (soft navigation swaps,
 * unlocked PasswordGate prose) and terms nested inside an open popover's
 * body — every lookup re-queries the live DOM, so no per-span wiring exists.
 *
 * Popovers form a stack: hovering a term inside a layer opens a deeper
 * layer (its term must stay alive, so the parent can never be reused), and
 * an inner layer keeps every ancestor open while the pointer is inside it.
 * An id already open in the chain stays inert (self-referencing refs).
 *
 * Interaction: hover shows (desktop pointers only — `hover: none` devices
 * get tap-toggle), moving the pointer into any layer keeps the chain open,
 * click pins/unpins, Escape and an outside press close, focus shows and
 * blur hides (keyboard). Layers sit in document coordinates (no positioned
 * ancestor intervenes), so they track their terms through scrolling.
 */
import { pagePayload } from './payload';
/** Fixed navbar clearance for the flip-above clamp (px, mirrors Toc.tsx). */
const NAV_OFFSET = 64;
/**
 * Grace period before unhovered, unpinned layers close. The timer resets on
 * every pointer move, so the pointer may travel slowly — or rest briefly —
 * between the term and the popover without losing it.
 */
const HIDE_DELAY_MS = 50;
/** Viewport margins the popover never crosses. */
const VIEWPORT_MARGIN = 8;

interface Layer {
  el: HTMLElement;
  term: HTMLElement;
}

/** Open layers, root first; layer i's term lives inside layer i-1's body. */
const layers: Layer[] = [];
/** Leading layers pinned by click/keyboard: they ignore hover-out and blur. */
let pinnedCount = 0;
let hideTimer = 0;
/** Unique id source for aria-describedby targets. */
let popoverSeq = 0;

/**
 * Loaded or in-flight defs assets by absolute URL; content-hashed names make
 * the entry double as the cross-navigation cache.
 */
const defsCache = new Map<string, Promise<Record<string, string> | null>>();
/** Terms with an in-flight async show (defs asset still loading). */
const pendingShows = new Set<HTMLElement>();

/**
 * Absolute URL of the current page's defs asset; null when the page inlines
 * its term bodies (dev) or references no terms.
 */
function refsUrl(): string | null {
  const refs = pagePayload()?.refs;
  return refs === undefined ? null : new URL(refs, document.baseURI).href;
}

/** Fetch (once per URL) the defs module an asset reference points at. */
function ensureDefs(url: string): Promise<Record<string, string> | null> {
  let cached = defsCache.get(url);
  if (cached === undefined) {
    cached = (
      import(/* @vite-ignore */ url) as Promise<{
        default: Record<string, string>;
      }>
    )
      .then(m => m.default)
      .catch((e: unknown) => {
        console.error(
          '[absolute-press] failed to load term refs asset',
          url,
          e,
        );
        return null;
      });
    defsCache.set(url, cached);
  }
  return cached;
}

let prefetchObserver: IntersectionObserver | null = null;

/**
 * Start loading the page's defs asset when the first term span nears the
 * viewport. `url` is the payload `refs` reference resolved by the caller —
 * against the navigation target on soft navigations, where document.baseURI
 * still names the outgoing page (see router applyPage). Null (dev inline
 * pages, term-free pages) disarms. Hidden terms — gated prose pre-unlock —
 * never intersect; their first hover takes the on-demand path in show().
 */
export function primeTermPrefetch(url: string | null): void {
  // Spans observed for a previous page are detached by the swap; drop them.
  prefetchObserver?.disconnect();
  prefetchObserver = null;
  if (url === null || defsCache.has(url)) return;
  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      void ensureDefs(url);
    },
    // Trigger ahead of visibility, so a quick hover still finds the data in.
    { rootMargin: '200px 0px' },
  );
  prefetchObserver = observer;
  for (const el of document.querySelectorAll('.ap-term')) observer.observe(el);
}

function clearHideTimer(): void {
  if (hideTimer !== 0) {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }
}

/** Drop every layer at or past `keep`, along with pins on them. */
function trimTo(keep: number): void {
  for (let i = layers.length - 1; i >= keep; i--) {
    layers[i]!.el.remove();
    layers[i]!.term.removeAttribute('aria-describedby');
    layers.pop();
  }
  pinnedCount = Math.min(pinnedCount, layers.length);
}

/** Close all layers immediately (soft navigation, Escape, outside press). */
export function hideTermPopover(): void {
  clearHideTimer();
  trimTo(0);
}

/**
 * Number of leading layers `node` hovers: the deepest layer whose body or
 * term contains it, plus one. Hovering an inner layer therefore counts as
 * hovering the whole chain, keeping ancestors open.
 */
function hoverKeep(node: EventTarget | null): number {
  if (!(node instanceof Node)) return 0;
  let keep = 0;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i]!.el.contains(node) || layers[i]!.term.contains(node)) {
      keep = i + 1;
    }
  }
  return keep;
}

/**
 * (Re)arm the delayed trim toward the layers `node` hovers. Called on every
 * mouseover/pointermove, so continuous movement outside the chain never
 * fires it — the layers close only once the pointer rests outside.
 */
function scheduleTrim(node: EventTarget | null): void {
  if (layers.length === 0) return;
  const keep = Math.max(hoverKeep(node), pinnedCount);
  clearHideTimer();
  if (keep >= layers.length) return;
  hideTimer = window.setTimeout(() => {
    hideTimer = 0;
    trimTo(keep);
  }, HIDE_DELAY_MS);
}

/**
 * Position a layer for `term` in document coordinates: centered under the
 * term, flipped above when the space below is short, clamped into the
 * viewport horizontally and below the navbar vertically. Everything runs in
 * one synchronous frame, so the pre-position state never paints.
 */
function place(el: HTMLElement, term: HTMLElement): void {
  el.style.left = '0px';
  el.style.top = '0px';
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const rect = term.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const viewW = document.documentElement.clientWidth;
  const centerX = rect.left + scrollX + rect.width / 2;
  const left = Math.max(
    scrollX + VIEWPORT_MARGIN,
    Math.min(centerX - width / 2, scrollX + viewW - width - VIEWPORT_MARGIN),
  );
  const below = rect.bottom + scrollY + 6;
  const above = rect.top + scrollY - height - 6;
  const fitsBelow =
    rect.bottom + height <= window.innerHeight - VIEWPORT_MARGIN;
  const top = Math.max(
    scrollY + NAV_OFFSET,
    fitsBelow ? below : Math.max(above, scrollY + NAV_OFFSET),
  );
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/**
 * Selector for a term's inline def template. The id comes from `data-term`,
 * so CSS.escape keeps ids with quotes or brackets from throwing at query
 * time (same guard Toc.tsx applies to heading slugs).
 */
export function termDefSelector(id: string): string {
  return `template.ap-term-def[data-term="${CSS.escape(id)}"]`;
}

/**
 * Show `term`'s popover as the deepest layer, cloning its definition body in.
 * A term already heading a layer just closes the layers below it; a term
 * without a definition (reference to a missing id — already warned at build)
 * or whose id is open further up the chain stays inert. On build pages the
 * body may still be inside the external defs asset: the show awaits the
 * (usually prefetch-warm) load.
 */
async function show(
  term: HTMLElement,
  trigger: 'hover' | 'focus' | 'pin',
): Promise<void> {
  clearHideTimer();
  const existing = layers.findIndex(layer => layer.term === term);
  if (existing !== -1) {
    trimTo(existing + 1);
    return;
  }
  const id = term.dataset.term;
  if (id === undefined) return;
  let template = document.querySelector<HTMLTemplateElement>(
    termDefSelector(id),
  );
  if (template === null) {
    const url = refsUrl();
    if (url === null || pendingShows.has(term)) return;
    pendingShows.add(term);
    let html: string | undefined;
    try {
      html = (await ensureDefs(url))?.[id];
    } finally {
      pendingShows.delete(term);
    }
    // The wait may outlive the gesture: a moved-on pointer, a blurred term
    // or a soft navigation must not conjure a popover afterwards.
    if (
      html === undefined ||
      !term.isConnected ||
      (trigger === 'hover' && !term.matches(':hover')) ||
      (trigger === 'focus' && document.activeElement !== term)
    ) {
      return;
    }
    template = document.createElement('template');
    template.innerHTML = html;
  }
  let depth = 0;
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i]!.el.contains(term)) {
      depth = i + 1;
      break;
    }
  }
  if (layers.slice(0, depth).some(l => l.term.dataset.term === id)) return;
  trimTo(depth);
  const el = document.createElement('div');
  el.id = `ap-term-popover-${++popoverSeq}`;
  el.className = 'ap-term-popover';
  el.setAttribute('role', 'tooltip');
  el.replaceChildren(template.content.cloneNode(true));
  (document.getElementById('ap-content') ?? document.body).append(el);
  el.setAttribute('data-open', '');
  term.setAttribute('aria-describedby', el.id);
  layers.push({ el, term });
  place(el, term);
}
/** Desktop-pointer check: touch devices drive the popover by tap only. */
function hasHover(): boolean {
  return window.matchMedia('(hover: hover)').matches;
}

/** Term span behind an event target (the nearest .ap-term ancestor). */
function termOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const term = node.closest<HTMLElement>('.ap-term');
  return term !== null && term.dataset.term !== undefined ? term : null;
}

/**
 * Pin-toggle shared by click and Enter/Space: pinning keeps the chain
 * interactive (links, selection) while the pointer wanders; activating the
 * term of an already pinned layer unpins and closes it.
 */
async function togglePin(term: HTMLElement): Promise<void> {
  const index = layers.findIndex(layer => layer.term === term);
  if (index !== -1 && pinnedCount > index) {
    trimTo(index);
    return;
  }
  await show(term, 'pin');
  const at = layers.findIndex(layer => layer.term === term);
  if (at !== -1) pinnedCount = at + 1;
}

/**
 * Runtime init: the delegated term listeners plus the initial page's prefetch
 * arming. Soft navigations re-arm via applyPage (primeTermPrefetch) and close
 * open layers (hideTermPopover).
 */
export function initTerms(): void {
  // Initial page: arm the viewport prefetch for its defs asset, if any.
  primeTermPrefetch(refsUrl());
  document.addEventListener('mouseover', event => {
    if (!hasHover()) return;
    const term = termOf(event.target);
    if (term !== null) {
      void show(term, 'hover');
      return;
    }
    scheduleTrim(event.target);
  });

  // Pointer motion between element boundaries carries no mouseover; keep
  // re-arming the trim so slow travel toward a layer never closes it.
  document.addEventListener(
    'pointermove',
    event => {
      if (hideTimer !== 0) scheduleTrim(event.target);
    },
    { passive: true },
  );

  document.addEventListener('pointerleave', () => scheduleTrim(null), {
    passive: true,
  });

  document.addEventListener('click', event => {
    const term = termOf(event.target);
    if (term !== null) {
      event.preventDefault();
      event.stopPropagation();
      void togglePin(term);
      return;
    }
    if (hoverKeep(event.target) > 0) return;
    // A press outside a pinned chain closes it (before link handlers run,
    // so an outside link navigates rather than only dismissing).
    if (pinnedCount > 0) hideTermPopover();
  });

  document.addEventListener('focusin', event => {
    const term = termOf(event.target);
    if (term !== null) void show(term, 'focus');
  });
  document.addEventListener('focusout', event => {
    if (pinnedCount > 0 || layers.length === 0) return;
    // Focus moving into a layer body (its links are focusable) keeps it.
    if (hoverKeep(event.relatedTarget) === 0) trimTo(0);
  });

  // Enter/Space activate the focused term like a click (the spans carry
  // tabindex from the renderer); Space also stops the page scroll.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && layers.length > 0) {
      hideTermPopover();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const term = termOf(event.target);
    if (term === null) return;
    event.preventDefault();
    void togglePin(term);
  });

  // Resize invalidates the show-time viewport clamp; hide rather than
  // re-place (scrolling is unaffected — the popover is document-positioned).
  window.addEventListener('resize', hideTermPopover, { passive: true });
}
