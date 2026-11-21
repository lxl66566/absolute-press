import { describe, expect, it } from 'vitest';

import { landingDelta } from '../anchor-scroll';

describe('landingDelta', () => {
  it('is zero when the element rests on its anchor line', () => {
    // docTop = rectTop + scrollY = 2000; want = 2000 - 180 = 1820 = scrollY.
    expect(landingDelta(180, 1820, 180, 10000, 800)).toBe(0);
  });

  it('is negative when short of the anchor line', () => {
    // Layout growth pushed the target 800px down mid-animation.
    expect(landingDelta(980, 1820, 180, 10000, 800)).toBe(-800);
  });

  it('is positive when overscrolled past the anchor line', () => {
    expect(landingDelta(80, 1820, 180, 10000, 800)).toBe(100);
  });

  it('clamps a target above the scroll range to the document top', () => {
    // A heading 100px into the document with a 180px margin lands at 0.
    expect(landingDelta(100, 0, 180, 10000, 800)).toBe(0);
  });

  it('clamps a target beyond the end to the last scrollable offset', () => {
    // docTop = 9000, max scroll = 5000: want 5000 even though 9000-180 is
    // unreachable.
    expect(landingDelta(3900, 5000, 180, 5800, 800)).toBe(0);
  });

  it('reports the missing distance when the document stops short', () => {
    // Same layout, but the scroll rested before reaching the clamp end.
    expect(landingDelta(4500, 4800, 180, 5800, 800)).toBe(-200);
  });

  it('treats a document shorter than the viewport as single-screen', () => {
    expect(landingDelta(400, 0, 180, 500, 800)).toBe(0);
  });

  it('rounds fractional offsets', () => {
    expect(landingDelta(180.6, 1820.2, 180, 10000, 800)).toBe(-1);
  });
});
