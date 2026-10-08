/**
 * Term-reference popovers: `[[id]]` renders as `<span class="ap-term">`
 * (build time) with a sibling `<template class="ap-term-def">` body
 * (decorateContent); this module shows the template's content in one
 * lazily created singleton popover, hosted inside #ap-content so the
 * prose styles (scoped there) cover its markdown body. Delegated events
 * at document level cover spans arriving after load (soft navigation
 * swaps, unlocked PasswordGate prose) and terms nested inside an open
 * popover's body — every lookup re-queries the live DOM, so no per-span
 * wiring exists.
 *
 * Interaction: hover shows (desktop pointers only — `hover: none` devices
 * get tap-toggle), moving the pointer into the popover keeps it open (its
 * body may hold links), click pins/unpins, Escape and an outside press
 * close, focus shows and blur hides (keyboard). The popover is positioned
 * in document coordinates (no positioned ancestor intervenes), so it
 * tracks its term through scrolling.
 */

/** Fixed navbar clearance for the flip-above clamp (px, mirrors Toc.tsx). */
const NAV_OFFSET = 64;
/** Grace period before an unpinned popover hides: wide enough to move the
 * pointer from the term into the popover body. */
const HIDE_DELAY_MS = 180;
/** Viewport margins the popover never crosses. */
const VIEWPORT_MARGIN = 8;

/** The singleton popover element; created on first show, reused after. */
let popover: HTMLElement | null = null;
/** Term the popover is currently shown for. */
let activeTerm: HTMLElement | null = null;
/** Pinned popovers ignore hover-out and blur; a press outside closes them. */
let pinned = false;
let hideTimer = 0;

function clearHideTimer(): void {
  if (hideTimer !== 0) {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }
}

/** Close the popover immediately (soft navigation, Escape, outside press). */
export function hideTermPopover(): void {
  clearHideTimer();
  if (popover !== null) popover.removeAttribute('data-open');
  if (activeTerm !== null) activeTerm.removeAttribute('aria-describedby');
  activeTerm = null;
  pinned = false;
}

function popoverEl(): HTMLElement {
  // A soft navigation drops the popover with the old content body, so a
  // detached singleton re-creates against the live #ap-content.
  if (popover === null || !popover.isConnected) {
    const el = document.createElement('div');
    el.id = 'ap-term-popover';
    el.className = 'ap-term-popover';
    el.setAttribute('role', 'tooltip');
    (document.getElementById('ap-content') ?? document.body).append(el);
    popover = el;
  }
  return popover;
}

/**
 * Position the popover for `term` in document coordinates: centered under
 * the term, flipped above when the space below is short, clamped into the
 * viewport horizontally and below the navbar vertically. Everything runs
 * in one synchronous frame, so the pre-position state never paints.
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
 * Show (or switch to) `term`'s popover: clone its template body in. A term
 * without a matching template (nested reference to a missing id — already
 * warned at build) stays inert.
 */
function show(term: HTMLElement): void {
  const id = term.dataset.term;
  if (id === undefined) return;
  const template = document.querySelector<HTMLTemplateElement>(
    `template.ap-term-def[data-term="${id}"]`,
  );
  if (template === null) return;
  clearHideTimer();
  if (activeTerm === term && popover?.hasAttribute('data-open')) return;
  hideTermPopover();
  const el = popoverEl();
  el.replaceChildren(template.content.cloneNode(true));
  el.setAttribute('data-open', '');
  activeTerm = term;
  term.setAttribute('aria-describedby', 'ap-term-popover');
  place(el, term);
}

/** Desktop-pointer check: touch devices drive the popover by tap only. */
function hasHover(): boolean {
  return window.matchMedia('(hover: hover)').matches;
}

/** The open popover's term under `node`, or null when `node` lies outside
 * both the term and the popover body. */
function withinOpen(node: EventTarget | null): boolean {
  return (
    node instanceof Node &&
    (popover?.contains(node) === true ||
      (activeTerm !== null && activeTerm.contains(node)))
  );
}

/** Term span behind an event target (the nearest .ap-term ancestor). */
function termOf(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const term = node.closest<HTMLElement>('.ap-term');
  return term !== null && term.dataset.term !== undefined ? term : null;
}

/**
 * Runtime init: the delegated term listeners. Installed once per page load;
 * soft navigation needs nothing here (applyPage calls hideTermPopover).
 */
export function initTerms(): void {
  document.addEventListener('mouseover', event => {
    if (!hasHover()) return;
    const term = termOf(event.target);
    if (term !== null) show(term);
    else if (!withinOpen(event.relatedTarget)) {
      // Pointer left both the term and the popover: hide after the grace
      // period (moving toward the popover cancels it via the show path).
      if (!pinned && activeTerm !== null && hideTimer === 0) {
        hideTimer = window.setTimeout(() => {
          hideTimer = 0;
          if (!pinned) hideTermPopover();
        }, HIDE_DELAY_MS);
      }
    }
  });

  // Click toggles the pin: pinned keeps the body interactive (links,
  // selection) while the pointer wanders; click on the open term unpins.
  document.addEventListener('click', event => {
    const term = termOf(event.target);
    if (term !== null) {
      event.preventDefault();
      event.stopPropagation();
      if (term === activeTerm && pinned) {
        hideTermPopover();
        return;
      }
      show(term);
      pinned = true;
      return;
    }
    if (!pinned && !withinOpen(event.target)) return;
    // A press outside a pinned popover closes it (before link handlers run,
    // so an outside link navigates rather than only dismissing).
    if (pinned && !withinOpen(event.target)) hideTermPopover();
  });

  document.addEventListener('focusin', event => {
    const term = termOf(event.target);
    if (term !== null) show(term);
  });
  document.addEventListener('focusout', event => {
    if (pinned || activeTerm === null) return;
    // Focus moving into the popover body (its links are focusable) keeps it.
    if (!withinOpen(event.relatedTarget)) hideTermPopover();
  });

  // Enter/Space activate the focused term like a click (the spans carry
  // tabindex from the renderer); Space also stops the page scroll.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeTerm !== null) {
      hideTermPopover();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const term = termOf(event.target);
    if (term === null) return;
    event.preventDefault();
    if (term === activeTerm && pinned) {
      hideTermPopover();
      return;
    }
    show(term);
    pinned = true;
  });

  // Resize invalidates the show-time viewport clamp; hide rather than
  // re-place (scrolling is unaffected — the popover is document-positioned).
  window.addEventListener('resize', hideTermPopover, { passive: true });
}
