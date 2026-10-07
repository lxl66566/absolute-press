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

/** Page scroll (px) past which the back-to-top button appears. */
export const BACK_TO_TOP_THRESHOLD_PX = 480;
