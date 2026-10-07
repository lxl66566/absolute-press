import { describe, expect, it } from 'vitest';

import { resolveScrollTarget } from '../scroll-restore';

describe('resolveScrollTarget', () => {
  it('restores the saved offset of an entry left mid-scroll', () => {
    expect(resolveScrollTarget({ apScroll: 500 }, '')).toEqual({
      kind: 'restored',
      y: 500,
    });
    // 0 is a real saved offset (the entry was left at the top), not "no
    // data" — only a missing/non-numeric value defers to the hash.
    expect(resolveScrollTarget({ apScroll: 0 }, '')).toEqual({
      kind: 'restored',
      y: 0,
    });
  });

  it('treats a missing or non-numeric offset as no saved scroll', () => {
    expect(resolveScrollTarget(null, '')).toEqual({ kind: 'top' });
    expect(resolveScrollTarget(undefined, '')).toEqual({ kind: 'top' });
    expect(resolveScrollTarget({}, '')).toEqual({ kind: 'top' });
    expect(resolveScrollTarget({ apScroll: '300' }, '')).toEqual({
      kind: 'top',
    });
  });

  it('re-anchors entries that carry a hash but no saved offset', () => {
    expect(resolveScrollTarget(null, '#intro')).toEqual({ kind: 'anchor' });
    expect(resolveScrollTarget(null, '#%E6%95%B0%E5%AD%A6')).toEqual({
      kind: 'anchor',
    });
    expect(resolveScrollTarget(undefined, '#')).toEqual({ kind: 'anchor' });
  });

  it('lets a saved offset outrank the hash on traversal', () => {
    // The user scrolled on from the anchor before leaving; a native MPA
    // traversal would restore the exact offset, not re-anchor.
    expect(resolveScrollTarget({ apScroll: 1200 }, '#intro')).toEqual({
      kind: 'restored',
      y: 1200,
    });
  });

  it('models a fresh pushed entry: hash anchors, bare URL tops', () => {
    // A new pushState entry has null state; the push branch reuses the
    // same policy for its initial scroll.
    expect(resolveScrollTarget(null, '#sec')).toEqual({ kind: 'anchor' });
    expect(resolveScrollTarget(null, '')).toEqual({ kind: 'top' });
  });
});
