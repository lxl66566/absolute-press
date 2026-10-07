import { describe, expect, it } from 'vitest';

import { readingMinutes } from '../reading-time';

describe('readingMinutes', () => {
  it('counts CJK text by characters (300 chars/min)', () => {
    // 600 CJK chars -> 2 minutes.
    const text = `${'字'.repeat(600)}\n`;
    expect(readingMinutes(text)).toBe(2);
  });

  it('counts latin text by words (200 words/min)', () => {
    const text = `${Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')}\n`;
    expect(readingMinutes(text)).toBe(2);
  });

  it('combines mixed Chinese and English linearly', () => {
    // 300 CJK (1 min) + 200 latin words (1 min) -> 2 minutes.
    const text = `${'字'.repeat(300)} ${Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ')}`;
    expect(readingMinutes(text)).toBe(2);
  });

  // Frontmatter handling lives in the caller now: readingMinutes takes the
  // already-stripped page content (see renderer.ts render()).
  it('excludes fenced code blocks from the estimate', () => {
    const prose = `${'字'.repeat(300)}`;
    const withCode = `${prose}\n\`\`\`ts\n${'code '.repeat(500)}\n\`\`\`\n`;
    expect(readingMinutes(withCode)).toBe(readingMinutes(prose));
  });

  it('excludes inline code spans', () => {
    const prose = `${'字'.repeat(300)}`;
    const withInline = `${prose}\n\`const a = ${'1'.repeat(200)}\`\n`;
    expect(readingMinutes(withInline)).toBe(readingMinutes(prose));
  });

  it('strips double-backtick spans containing backticks', () => {
    // ``...`` spans may hold single backticks in their content; both the
    // delimiters and the embedded ticks must not reach the word counter.
    const prose = `${'字'.repeat(300)}`;
    const withTicks = `${prose}\n\`\`tick\`tock\` (${'word '.repeat(100)})\`\`\n`;
    expect(readingMinutes(withTicks)).toBe(readingMinutes(prose));
  });

  it('excludes 4-space-indented code blocks', () => {
    const prose = `${'字'.repeat(290)}`;
    const withIndented = `${prose}\n\n    ${'code '.repeat(500)}\n    more code\n\n${'字'.repeat(10)}`;
    // 290 + 10 CJK = one minute; the 500-word indented block never counts.
    expect(readingMinutes(withIndented)).toBe(1);
    expect(readingMinutes(withIndented)).toBe(readingMinutes(prose));
  });

  it('keeps paragraph lazy continuations despite 4-space indent', () => {
    // A 4-space-indented line right after prose is a lazy paragraph
    // continuation, not an indented code block.
    const withLazy = `para\n    continued ${'word '.repeat(200)}\n`;
    expect(readingMinutes(withLazy)).toBe(2);
  });

  it('excludes island props but keeps island inner content', () => {
    const names = new Set(['G2Plot']);
    const inner = `${'字'.repeat(300)}`;
    const withIsland = `<G2Plot :data='{"box":[${'1,'.repeat(4000)}1]}'>${inner}</G2Plot>`;
    expect(readingMinutes(withIsland, names)).toBe(1);
    // Without the registration the tag is inert text and the JSON props
    // alone dominate the estimate (4000+ numeric "words").
    expect(readingMinutes(withIsland)).toBeGreaterThanOrEqual(20);
  });

  it('handles a tilde fence and normalizes CRLF', () => {
    const src = `~~~\r\n${'word '.repeat(400)}\r\n~~~\r\n${'字'.repeat(300)}`;
    // Tilde fence content is excluded; only the 300 CJK chars count.
    expect(readingMinutes(src)).toBe(1);
  });

  it('returns at least one minute for empty pages', () => {
    expect(readingMinutes('')).toBe(1);
  });

  it('rounds fractional minutes up', () => {
    expect(readingMinutes('字'.repeat(301))).toBe(2);
  });
});
