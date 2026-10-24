/**
 * Shared chrome constants. Keep magic numbers that several components must
 * agree on in one place; component-local tuning values stay local.
 */

/**
 * Settle time for the shared 0fr/1fr grid collapse (`.ap-collapse` in
 * styles/theme.css): the grid-template-rows transition itself runs 160ms;
 * the slack covers start latency. Rows measured before the settle read
 * short. Keep in sync with the 160ms transition.
 */
export const FOLD_SETTLE_MS = 200;

/**
 * Clearance below the fixed navbar, in px: the TOC spy band's top edge
 * (rootMargin) and the term popover's flip-below-the-navbar clamp share it.
 * The header is --ap-nav-h: 3.5rem (56px) plus 8px of breathing room — keep
 * in sync with that CSS variable (the JS value stays px on purpose).
 */
export const NAV_CLEARANCE_PX = 64;

/** Page scroll (px) past which the back-to-top button appears. */
export const BACK_TO_TOP_THRESHOLD_PX = 480;
