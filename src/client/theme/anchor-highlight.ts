/**
 * Anchor navigation target highlight.
 *
 * After a jump to a `#heading` hash the target heading keeps an accent tint
 * until the user scrolls on their own. Cancellation listens for explicit
 * scroll intents (wheel / touchmove / scroll keys / scrollbar grab) instead
 * of `scroll` events: the programmatic smooth scroll fires `scroll` too and
 * would clear the highlight immediately.
 */

const FLASH_CLASS = 'ap-anchor-flash';

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/** Keys whose default action scrolls the page. */
export const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

/** True for elements where scroll keys edit text instead of scrolling the
 * page (form fields, contenteditable hosts). Pure in its inputs for tests. */
export function isEditableTarget(
  tagName: string,
  isContentEditable: boolean,
): boolean {
  const tag = tagName.toUpperCase();
  return isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA';
}

/** True when a mouse press lands outside the rendered viewport, i.e. in a
 * classic scrollbar gutter. Pure in its inputs for tests. */
export function isScrollbarPress(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return x >= viewportWidth || y >= viewportHeight;
}

let armed = false;

function onKeyDown(e: KeyboardEvent): void {
  if (!SCROLL_KEYS.has(e.key)) return;
  // Space/arrows inside an editable element edit text, not the scroll.
  if (
    e.target instanceof HTMLElement &&
    isEditableTarget(e.target.tagName, e.target.isContentEditable)
  ) {
    return;
  }
  clearFlash();
}

// Scrollbar drags emit no wheel/touch/key events. Chromium and Safari report
// the press as a mousedown on <html> with coordinates inside the gutter;
// Firefox emits no DOM event at all for scrollbar presses, where the
// highlight simply persists until the next explicit scroll intent. Overlay
// scrollbars never produce gutter coordinates, and RTL left gutters are not
// detected either — in every undetected case the highlight outlives the
// drag, which is the safe direction.
function onMouseDown(e: MouseEvent): void {
  const root = document.documentElement;
  if (
    isScrollbarPress(e.clientX, e.clientY, root.clientWidth, root.clientHeight)
  ) {
    clearFlash();
  }
}

function clearFlash(): void {
  if (!armed) return;
  armed = false;
  document.querySelector(`.${FLASH_CLASS}`)?.classList.remove(FLASH_CLASS);
  window.removeEventListener('wheel', clearFlash);
  window.removeEventListener('touchmove', clearFlash);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('mousedown', onMouseDown);
}

function armClearListeners(): void {
  if (armed) return;
  armed = true;
  window.addEventListener('wheel', clearFlash, { passive: true });
  window.addEventListener('touchmove', clearFlash, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('mousedown', onMouseDown);
}

/** Element `hash` points at (percent-decoded); null for an empty hash or a
 * missing target. Shared lookup for the flash and the router's anchor
 * scrolling. */
export function anchorTargetElement(hash: string): Element | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    // malformed percent-encoding: fall back to the raw value
  }
  return document.getElementById(id);
}

/** Highlight the heading `hash` points at; stays until the user scrolls.
 * Non-heading or missing targets only clear a previous highlight. */
export function flashAnchorTarget(hash: string): void {
  clearFlash();
  const el = anchorTargetElement(hash);
  if (!el || !el.matches(HEADING_SELECTOR)) return;
  el.classList.add(FLASH_CLASS);
  armClearListeners();
}

/** Runtime init: flash on initial load with a hash and on later hash
 * changes. TOC clicks call flashAnchorTarget directly (pushState fires no
 * hashchange). */
export function initAnchorHighlight(): void {
  flashAnchorTarget(location.hash);
  window.addEventListener('hashchange', () => flashAnchorTarget(location.hash));
}
