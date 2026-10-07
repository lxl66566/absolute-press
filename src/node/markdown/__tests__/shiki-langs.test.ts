import { describe, expect, it } from 'vitest';

import { isBundledLang } from '../renderer.ts';

describe('isBundledLang', () => {
  it('accepts bundled languages and their aliases', () => {
    expect(isBundledLang('typescript')).toBe(true);
    expect(isBundledLang('ts')).toBe(true);
    expect(isBundledLang('bash')).toBe(true);
  });

  it('rejects unknown names and shiki special langs', () => {
    // Unknown names must not reach createHighlighter (it throws); their
    // fences keep the fallbackLanguage plain-text rendering instead.
    expect(isBundledLang('not-a-language')).toBe(false);
    expect(isBundledLang('')).toBe(false);
    // Special langs are core-internal, not bundle keys.
    expect(isBundledLang('text')).toBe(false);
    expect(isBundledLang('ansi')).toBe(false);
  });
});
