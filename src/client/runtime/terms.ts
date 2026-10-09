/**
 * Term-reference popovers: `[[id]]` renders as `<span class="ap-term">`
 * (build time) with `<template class="ap-term-def">` bodies appended to the
 * page (injectTermDefs); this module shows a template's content in a lazily
 * created popover, hosted inside #ap-content so the prose styles (scoped
 * there) cover its markdown body. Delegated events at document level cover
 * spans arriving after load (soft navigation swaps, unlocked PasswordGate
 * prose) and terms nested inside an open popover's body — every lookup
 * re-queries the live DOM, so no per-span wiring exists.
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
 * Show `term`'s popover as the deepest layer, cloning its template body in.
 * A term already heading a layer just closes the layers below it; a term
 * without a matching template (nested reference to a missing id — already
 * warned at build) or whose id is open further up the chain stays inert.
 */
function show(term: HTMLElement): void {
  clearHideTimer();
  const existing = layers.findIndex(layer => layer.term === term);
  if (existing !== -1) {
    trimTo(existing + 1);
    return;
  }
  const id = term.dataset.term;
  if (id === undefined) return;
  const template = document.querySelector<HTMLTemplateElement>(
    `template.ap-term-def[data-term="${id}"]`,
  );
  if (template === null) return;
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
function togglePin(term: HTMLElement): void {
  const index = layers.findIndex(layer => layer.term === term);
  if (index !== -1 && pinnedCount > index) {
    trimTo(index);
    return;
  }
  show(term);
  const at = layers.findIndex(layer => layer.term === term);
  if (at !== -1) pinnedCount = at + 1;
}

/**
 * Runtime init: the delegated term listeners. Installed once per page load;
 * soft navigation needs nothing here (applyPage calls hideTermPopover).
 */
export function initTerms(): void {
  document.addEventListener('mouseover', event => {
    if (!hasHover()) return;
    const term = termOf(event.target);
    if (term !== null) {
      show(term);
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
      togglePin(term);
      return;
    }
    if (hoverKeep(event.target) > 0) return;
    // A press outside a pinned chain closes it (before link handlers run,
    // so an outside link navigates rather than only dismissing).
    if (pinnedCount > 0) hideTermPopover();
  });

  document.addEventListener('focusin', event => {
    const term = termOf(event.target);
    if (term !== null) show(term);
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
    togglePin(term);
  });

  // Resize invalidates the show-time viewport clamp; hide rather than
  // re-place (scrolling is unaffected — the popover is document-positioned).
  window.addEventListener('resize', hideTermPopover, { passive: true });
}
