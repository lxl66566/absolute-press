import { describe, expect, it } from 'vitest';

import { flagOn } from '../props';
import { scaleToWidth } from '../ZoomedImg';

describe('scaleToWidth', () => {
  it('normalizes fractional numbers to percent, others verbatim', () => {
    expect(scaleToWidth(0.6)).toBe('60%');
    expect(scaleToWidth(1)).toBe('100%');
    expect(scaleToWidth(80)).toBe('80%');
    expect(scaleToWidth(1_000_000)).toBe('1000000%');
    // 0 and negatives fall out of the (0,1] window unchanged — an invalid
    // CSS width the browser then ignores.
    expect(scaleToWidth(0)).toBe('0%');
    expect(scaleToWidth(-0.5)).toBe('-0.5%');
  });

  it('parses numeric strings with the same fraction rule', () => {
    expect(scaleToWidth('0.6')).toBe('60%');
    expect(scaleToWidth('1')).toBe('100%');
    expect(scaleToWidth('80')).toBe('80%');
    expect(scaleToWidth('0')).toBe('0%');
    expect(scaleToWidth('-5')).toBe('-5%');
    // parseFloat semantics: a trailing unit is cut off.
    expect(scaleToWidth('50px')).toBe('50%');
  });

  it('keeps percent strings as-is after trimming', () => {
    expect(scaleToWidth('60%')).toBe('60%');
    expect(scaleToWidth('  60%  ')).toBe('60%');
  });

  it('returns null for undefined, blank and non-numeric input', () => {
    expect(scaleToWidth(undefined)).toBeNull();
    expect(scaleToWidth('')).toBeNull();
    expect(scaleToWidth('   ')).toBeNull();
    expect(scaleToWidth('abc')).toBeNull();
  });
});

describe('flagOn', () => {
  it('defaults to off, unlike the fallback-based spellings elsewhere', () => {
    expect(flagOn(undefined)).toBe(false);
    expect(flagOn('')).toBe(false);
  });

  it('accepts booleans and string spellings with explicit off-words', () => {
    expect(flagOn(true)).toBe(true);
    expect(flagOn(false)).toBe(false);
    expect(flagOn('true')).toBe(true);
    expect(flagOn('1')).toBe(true);
    expect(flagOn('yes')).toBe(true);
    expect(flagOn('false')).toBe(false);
    expect(flagOn('0')).toBe(false);
  });
});
