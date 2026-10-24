import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { termDefSelector } from '../terms';

// The node env has no CSS global: stand in with the subset of CSS.escape
// semantics the assertion relies on (backslash-escaping quotes).
beforeEach(() => {
  vi.stubGlobal('CSS', {
    escape: (value: string): string => value.replace(/["\\]/g, '\\$&'),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('termDefSelector', () => {
  it('builds the def template selector for plain ids', () => {
    expect(termDefSelector('plain')).toBe(
      'template.ap-term-def[data-term="plain"]',
    );
  });

  it('escapes ids so a quote in data-term cannot break the selector', () => {
    // The raw quote must not survive into the attribute selector: an
    // unescaped one used to throw SyntaxError out of the unhandled show().
    const selector = termDefSelector('a"b');
    expect(selector).toBe('template.ap-term-def[data-term="a\\"b"]');
    expect(selector).not.toContain('a"b');
  });
});
