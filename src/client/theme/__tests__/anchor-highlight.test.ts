import { describe, expect, it } from 'vitest';

import {
  isEditableTarget,
  isScrollbarPress,
  SCROLL_KEYS,
} from '../anchor-highlight';

describe('isEditableTarget', () => {
  it('accepts form field tag names case-insensitively', () => {
    expect(isEditableTarget('input', false)).toBe(true);
    expect(isEditableTarget('INPUT', false)).toBe(true);
    expect(isEditableTarget('textarea', false)).toBe(true);
    expect(isEditableTarget('TEXTAREA', false)).toBe(true);
  });

  it('accepts any contenteditable host regardless of tag', () => {
    expect(isEditableTarget('div', true)).toBe(true);
    expect(isEditableTarget('p', true)).toBe(true);
    // Editable wins over a non-field tag name.
    expect(isEditableTarget('input', true)).toBe(true);
  });

  it('rejects plain non-editable elements', () => {
    expect(isEditableTarget('div', false)).toBe(false);
    expect(isEditableTarget('button', false)).toBe(false);
    expect(isEditableTarget('a', false)).toBe(false);
    expect(isEditableTarget('body', false)).toBe(false);
  });
});

describe('isScrollbarPress', () => {
  const VW = 1280;
  const VH = 720;

  it('rejects presses inside the rendered viewport', () => {
    expect(isScrollbarPress(0, 0, VW, VH)).toBe(false);
    expect(isScrollbarPress(VW - 1, VH - 1, VW, VH)).toBe(false);
    // Negative coordinates (multi-monitor setups) are still inside.
    expect(isScrollbarPress(-10, -10, VW, VH)).toBe(false);
  });

  it('detects the vertical scrollbar gutter at and beyond the edge', () => {
    expect(isScrollbarPress(VW, 10, VW, VH)).toBe(true);
    expect(isScrollbarPress(VW - 1, 10, VW, VH)).toBe(false);
    expect(isScrollbarPress(VW + 200, 10, VW, VH)).toBe(true);
  });

  it('detects the horizontal scrollbar gutter below the edge', () => {
    expect(isScrollbarPress(10, VH, VW, VH)).toBe(true);
    expect(isScrollbarPress(10, VH - 1, VW, VH)).toBe(false);
    // Both axes outside: still a gutter press.
    expect(isScrollbarPress(VW, VH, VW, VH)).toBe(true);
  });
});

describe('SCROLL_KEYS', () => {
  it('contains exactly the keys whose default action scrolls', () => {
    expect(SCROLL_KEYS).toEqual(
      new Set([
        'ArrowUp',
        'ArrowDown',
        'PageUp',
        'PageDown',
        'Home',
        'End',
        ' ',
      ]),
    );
  });

  it('excludes plain letters and non-scrolling control keys', () => {
    for (const key of ['a', 'Z', '0', 'Enter', 'Escape', 'Tab', 'Shift']) {
      expect(SCROLL_KEYS.has(key)).toBe(false);
    }
  });
});
