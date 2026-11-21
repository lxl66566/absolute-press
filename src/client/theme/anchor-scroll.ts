/**
 * Anchor scrolling with a landing correction (Toc navigate / TocInline).
 *
 * Engines capture a smooth scroll's destination once, at scrollIntoView
 * time: layout that grows above the target while the animation runs
 * (images finishing, lazy islands rendering) leaves the document short of
 * the heading. The watch re-aims via scrollIntoView whenever the document
 * settles, until the heading rests on its scroll-margin anchor line or the
 * budget runs out. Explicit reader scroll intent stops the watch — reader
 * input always wins.
 */
import { watchUserScrollIntent } from './anchor-highlight';

/** Landing tolerance: rounding and sub-pixel drift stay uncorrected. */
const LANDING_TOLERANCE_PX = 2;

/** Whole-watch budget: the initial animation plus a corrective glide fit
 * inside; a target that never stops moving gives up instead of looping. */
const WATCH_BUDGET_MS = 2500;

/** Unchanged scroll offsets across this many frames count as settled. */
const SETTLE_FRAMES = 3;

/** A scroll that never visibly moved is only settled after this long: a
 * zero-distance scrollIntoView, or an animation easing in from a
 * standstill, must not read as "already settled" at frame one. */
const IDLE_SETTLE_MS = 250;

/**
 * Signed landing error of the document scroller against the element's
 * scroll-margin-top anchor line, with both ends clamped to the scrollable
 * range. 0 = the element rests on its anchor line; negative = short of it.
 * Pure in its inputs for tests.
 */
export function landingDelta(
  rectTop: number,
  scrollY: number,
  scrollMarginTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  const want = Math.min(Math.max(0, rectTop + scrollY - scrollMarginTop), max);
  return Math.round(scrollY - want);
}

/** Re-aim while the target keeps slipping (layout growth, corrective
 * glides). Returns a stop control; superseding callers stop the old watch. */
function watchLanding(el: HTMLElement, smooth: boolean): () => void {
  let raf = 0;
  let stopped = false;
  const stopIntent = watchUserScrollIntent(stop);
  const start = performance.now();
  let settled = 0;
  let moved = false;
  let lastY = window.scrollY;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    stopIntent();
    cancelAnimationFrame(raf);
  }
  const behavior = smooth ? 'smooth' : 'auto';
  const frame = (): void => {
    // A soft navigation swaps the document body out from under the watch.
    if (!el.isConnected) {
      stop();
      return;
    }
    const now = performance.now();
    if (now - start >= WATCH_BUDGET_MS) {
      stop();
      return;
    }
    const y = window.scrollY;
    if (y !== lastY) {
      moved = true;
      settled = 0;
      lastY = y;
    } else {
      settled += 1;
    }
    if (settled >= SETTLE_FRAMES && (moved || now - start >= IDLE_SETTLE_MS)) {
      const delta = landingDelta(
        el.getBoundingClientRect().top,
        window.scrollY,
        parseFloat(getComputedStyle(el).scrollMarginTop) || 0,
        document.documentElement.scrollHeight,
        document.documentElement.clientHeight,
      );
      if (Math.abs(delta) <= LANDING_TOLERANCE_PX) {
        stop();
        return;
      }
      // Corrective glide: browser geometry again, never a hand-computed
      // offset (see the toc-spy-reveal archive on the rect/scroll trap).
      el.scrollIntoView({ behavior, block: 'start' });
      settled = 0;
      moved = false;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return stop;
}

/**
 * Scroll to an anchor heading and keep the landing honest (module comment).
 * Returns a stop control for the caller's supersede/cleanup bookkeeping.
 */
export function scrollToAnchor(el: HTMLElement, smooth: boolean): () => void {
  el.scrollIntoView({
    behavior: smooth ? 'smooth' : 'auto',
    block: 'start',
  });
  return watchLanding(el, smooth);
}
