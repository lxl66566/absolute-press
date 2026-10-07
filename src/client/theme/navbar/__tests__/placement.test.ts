import { describe, expect, it } from 'vitest';

import {
  nestedMaxWidth,
  placeNestedFlyout,
  placeTopFlyout,
} from '../placement';

/**
 * Expected values are derived by hand from the placement semantics:
 * MARGIN = 8, MIN_PANEL_WIDTH = 160, MIN_USEFUL_SLICE = 96, and the
 * half-viewport cap floor(viewH / 2) that mirrors .ap-nav-drop's CSS
 * `max-height: 50vh` (two copies, changed together).
 */

describe('nestedMaxWidth', () => {
  it('uses the room right of the anchor row', () => {
    expect(nestedMaxWidth(1280, 300)).toBe(972);
  });

  it('floors at 160 on narrow viewports', () => {
    expect(nestedMaxWidth(500, 350)).toBe(160);
  });

  it('floors at 160 when the anchor sits at the right edge', () => {
    expect(nestedMaxWidth(1280, 1276)).toBe(160);
  });
});

describe('placeNestedFlyout', () => {
  it('aligns with the row when the room below holds a useful slice', () => {
    // Room below: 800 - 8 - 400 = 392 >= 96 -> no pull-up.
    expect(
      placeNestedFlyout({
        viewport: { width: 1280, height: 800 },
        anchor: { top: 400, right: 300 },
        panel: { height: 300 },
        navBottom: 56,
      }),
    ).toEqual({ left: 300, top: 400, maxHeight: 300 });
  });

  it('caps a tall panel at half the viewport', () => {
    expect(
      placeNestedFlyout({
        viewport: { width: 1000, height: 800 },
        anchor: { top: 100, right: 150 },
        panel: { height: 900 },
        navBottom: 56,
      }),
    ).toEqual({ left: 150, top: 100, maxHeight: 400 }); // floor(800 / 2)
  });

  it('pulls up when the room below cannot hold a useful slice', () => {
    // Room below: 600 - 8 - 505 = 87 < 96 -> shown = 260, top = 600 - 8 - 260.
    const placed = placeNestedFlyout({
      viewport: { width: 1280, height: 600 },
      anchor: { top: 505, right: 200 },
      panel: { height: 260 },
      navBottom: 56,
    });
    expect(placed).toEqual({ left: 200, top: 332, maxHeight: 260 });
    // Bottom edge sits exactly one margin above the viewport bottom.
    expect(placed.top + placed.maxHeight).toBe(592);
  });

  it('keeps the row-aligned boundary case at exactly-fitting room', () => {
    // Room below: 400 - 8 - 296 = 96 === threshold -> stays row-aligned,
    // panel flush with viewport bottom - margin (strict `<` in the check).
    const placed = placeNestedFlyout({
      viewport: { width: 1280, height: 400 },
      anchor: { top: 296, right: 100 },
      panel: { height: 96 },
      navBottom: 56,
    });
    expect(placed).toEqual({ left: 100, top: 296, maxHeight: 96 });
  });

  it('pulls up a short panel that cannot fully fit below its row', () => {
    // Panel shorter than 96 must fit entirely: room 300 - 8 - 255 = 37 < 60.
    expect(
      placeNestedFlyout({
        viewport: { width: 1280, height: 300 },
        anchor: { top: 255, right: 100 },
        panel: { height: 60 },
        navBottom: 56,
      }),
    ).toEqual({ left: 100, top: 232, maxHeight: 60 });
  });

  it('squeezes into a short viewport between navbar and viewport bottom', () => {
    // shown = min(500, 200, 400 - 56 - 16 = 328) = 200 (half-viewport cap
    // binds over the navbar gap); top = 400 - 8 - 200 = 192.
    const placed = placeNestedFlyout({
      viewport: { width: 1280, height: 400 },
      anchor: { top: 300, right: 250 },
      panel: { height: 500 },
      navBottom: 56,
    });
    expect(placed).toEqual({ left: 250, top: 192, maxHeight: 200 });
    expect(placed.top + placed.maxHeight).toBe(392); // 400 - MARGIN
  });

  it('never rises above the navbar edge when the navbar is tall', () => {
    // shown = min(400, 150, 300 - 250 - 16 = 34) = 34; the two clamp floors
    // coincide: top = max(navBottom + 8, 300 - 8 - 34) = 258.
    const placed = placeNestedFlyout({
      viewport: { width: 1280, height: 300 },
      anchor: { top: 290, right: 100 },
      panel: { height: 400 },
      navBottom: 250,
    });
    expect(placed).toEqual({ left: 100, top: 258, maxHeight: 34 });
    expect(placed.top).toBe(250 + 8); // navBottom + MARGIN
    expect(placed.top + placed.maxHeight).toBe(292); // 300 - MARGIN
  });
});

describe('placeTopFlyout', () => {
  it('keeps the natural left edge when the panel fits', () => {
    expect(
      placeTopFlyout({
        viewport: { width: 1280 },
        anchor: { left: 500 },
        panel: { width: 300 },
      }),
    ).toBe(500);
  });

  it('shifts left so the panel stays inside the right viewport edge', () => {
    const left = placeTopFlyout({
      viewport: { width: 1280 },
      anchor: { left: 1100 },
      panel: { width: 300 },
    });
    expect(left).toBe(972);
    expect(left + 300).toBe(1272); // 1280 - MARGIN
  });

  it('clamps to the left margin when the panel outgrows the viewport', () => {
    // min(100, 300 - 8 - 400 = -108) -> floor at MARGIN.
    expect(
      placeTopFlyout({
        viewport: { width: 300 },
        anchor: { left: 100 },
        panel: { width: 400 },
      }),
    ).toBe(8);
  });
});
