/**
 * Pure flyout placement math for navbar dropdown panels, extracted from
 * NavEntry's placeFlyout shell. No DOM and no Solid: callers measure the
 * anchor row and the panel's natural size, apply the nested width clamp
 * before measuring, then write the returned viewport coordinates back to
 * styles. Keeping the math DOM-free makes the viewport-edge rules
 * unit-testable without a layout engine.
 *
 * All returned coordinates are viewport-relative; the shell converts them
 * to header-relative style values because the fixed header's
 * backdrop-filter makes the header the containing block for fixed panels.
 */

/** Viewport-edge clearance kept between a panel and the viewport border. */
const MARGIN = 8;
/** Nested flyouts never shrink below this width (readability floor). */
const MIN_PANEL_WIDTH = 160;
/**
 * Room below the anchor that still counts as a usable slice: taller panels
 * may start at the row and clip (internal scrolling), shorter ones must fit
 * entirely or the panel gets pulled up instead.
 */
const MIN_USEFUL_SLICE = 96;

export interface NestedFlyoutInput {
  viewport: { width: number; height: number };
  /** Anchor row rect (viewport coordinates); the panel opens to its right. */
  anchor: { top: number; right: number };
  /** Panel natural height, measured with previous clamps removed. */
  panel: { height: number };
  /** Navbar bottom edge (viewport coordinates). */
  navBottom: number;
}

export interface NestedFlyoutPlacement {
  left: number;
  top: number;
  /** Height clamp for the panel's internal scroll. */
  maxHeight: number;
}

/**
 * Nested flyouts open to the right: only the room right of the anchor row is
 * available, so the width clamp keeps the panel inside the viewport. The
 * shell must apply this BEFORE measuring the panel — it changes how rows
 * wrap and thus the measured height.
 */
export function nestedMaxWidth(viewWidth: number, anchorRight: number): number {
  return Math.max(MIN_PANEL_WIDTH, viewWidth - MARGIN - anchorRight);
}

/**
 * Place a nested flyout next to its anchor row. Prefer aligning with the
 * row; when the room below cannot hold a useful slice, pull the panel up
 * just enough to fit — never above the navbar edge, so it stays adjacent to
 * its row and reachable.
 */
export function placeNestedFlyout(
  input: NestedFlyoutInput,
): NestedFlyoutPlacement {
  const { viewport, anchor, panel, navBottom } = input;
  const viewH = viewport.height;
  // Panels cap at about half the viewport (site UX rule); the CSS twin for
  // top-level panels lives on .ap-nav-drop in theme.css.
  const panelCap = Math.floor(viewH / 2);
  let top = anchor.top;
  if (
    viewH - MARGIN - top <
    Math.min(panel.height, panelCap, MIN_USEFUL_SLICE)
  ) {
    const shown = Math.min(
      panel.height,
      panelCap,
      viewH - navBottom - MARGIN * 2,
    );
    top = Math.max(navBottom + MARGIN, viewH - MARGIN - shown);
  }
  const maxH = Math.max(0, Math.min(viewH - MARGIN - top, panelCap));
  return { left: anchor.right, top, maxHeight: Math.min(panel.height, maxH) };
}

/**
 * Place a top-level panel below its row (CSS top-full): shift it left when
 * the natural width would cross the viewport's right edge, so hovering the
 * last items never grows a page-level horizontal scrollbar. Returns the
 * panel's viewport-space left edge; the vertical side stays CSS-driven.
 */
export function placeTopFlyout(input: {
  viewport: { width: number };
  anchor: { left: number };
  panel: { width: number };
}): number {
  const { viewport, anchor, panel } = input;
  return Math.max(
    MARGIN,
    Math.min(anchor.left, viewport.width - MARGIN - panel.width),
  );
}
