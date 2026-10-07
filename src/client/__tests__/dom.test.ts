import { afterEach, describe, expect, it, vi } from 'vitest';

import { NEAR_ROOT_MARGIN, nearView, observeNearOnce } from '../dom';

/**
 * Minimal IntersectionObserver stub: captures the callback and lets tests
 * deliver batches manually — no real observer timing involved (observer
 * callbacks are frozen in embedded preview panels, so unit tests must not
 * depend on them). A disconnected observer swallows deliveries, mirroring
 * the real contract.
 */
class FakeObserver {
  static latest: FakeObserver | null = null;
  readonly root: Element | Document | null = null;
  readonly rootMargin: string;
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [0];
  disconnected = false;
  readonly callback: IntersectionObserverCallback;
  readonly observed: Element[] = [];

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '';
    FakeObserver.latest = this;
  }

  observe(el: Element): void {
    this.observed.push(el);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  deliver(entries: readonly { isIntersecting: boolean }[]): void {
    if (this.disconnected) return;
    // The narrow entry shape is all the theme's viewport decisions read.
    this.callback(entries as IntersectionObserverEntry[], this);
  }
}

describe('nearView', () => {
  it('is false for an empty or all-offscreen batch', () => {
    expect(nearView([])).toBe(false);
    expect(nearView([{ isIntersecting: false }])).toBe(false);
    expect(
      nearView([{ isIntersecting: false }, { isIntersecting: false }]),
    ).toBe(false);
  });

  it('is true when any entry intersects', () => {
    expect(
      nearView([{ isIntersecting: false }, { isIntersecting: true }]),
    ).toBe(true);
  });
});

describe('observeNearOnce', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes with the given margin and fires on the first near batch', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    let fires = 0;
    const el = {} as Element;
    const stop = observeNearOnce(el, NEAR_ROOT_MARGIN, () => {
      fires += 1;
    });
    const io = FakeObserver.latest;
    expect(io?.observed).toEqual([el]);
    expect(io?.rootMargin).toBe(NEAR_ROOT_MARGIN);
    io?.deliver([{ isIntersecting: false }]);
    expect(fires).toBe(0);
    io?.deliver([{ isIntersecting: false }, { isIntersecting: true }]);
    expect(fires).toBe(1);
    // Once-semantics: the observer disconnected itself, and no late batch
    // (or double intersection) can fire onNear again.
    expect(io?.disconnected).toBe(true);
    io?.deliver([{ isIntersecting: true }]);
    expect(fires).toBe(1);
    stop();
  });

  it('never fires once stopped before a near batch', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    let fires = 0;
    const stop = observeNearOnce({} as Element, '0px', () => {
      fires += 1;
    });
    stop();
    expect(FakeObserver.latest?.disconnected).toBe(true);
    FakeObserver.latest?.deliver([{ isIntersecting: true }]);
    expect(fires).toBe(0);
  });

  it('degrades to an immediate call without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    let fires = 0;
    const stop = observeNearOnce({} as Element, NEAR_ROOT_MARGIN, () => {
      fires += 1;
    });
    expect(fires).toBe(1);
    // The fallback disconnector is a safe no-op.
    expect(() => stop()).not.toThrow();
  });
});
