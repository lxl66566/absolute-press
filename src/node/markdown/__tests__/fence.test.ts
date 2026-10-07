import { describe, expect, it } from 'vitest';

import { fenceLanguages, fenceOpenOf, isFenceClose } from '../fence';

describe('fenceOpenOf', () => {
  it('detects 3+ backtick and tilde runs at line start', () => {
    expect(fenceOpenOf('```ts')).toEqual({ ch: '`', len: 3 });
    expect(fenceOpenOf('~~~~~~')).toEqual({ ch: '~', len: 6 });
    // Up to 3 leading spaces are allowed.
    expect(fenceOpenOf('  ```')).toEqual({ ch: '`', len: 3 });
    expect(fenceOpenOf('text ```')).toBeNull();
    expect(fenceOpenOf('    ```')).toBeNull();
  });
});

describe('isFenceClose', () => {
  it('requires a run of at least the open length, alone on the line', () => {
    const open = { ch: '`', len: 3 };
    expect(isFenceClose('```', open)).toBe(true);
    expect(isFenceClose('`````', open)).toBe(true);
    expect(isFenceClose('``', open)).toBe(false);
    expect(isFenceClose('``` ts', open)).toBe(false);
    expect(isFenceClose('code```', open)).toBe(false);
    expect(isFenceClose('   ```', open)).toBe(true);
  });

  it('matches only the open marker char and tolerates CRLF', () => {
    expect(isFenceClose('~~~', { ch: '`', len: 3 })).toBe(false);
    expect(isFenceClose('~~~\r', { ch: '~', len: 3 })).toBe(true);
    expect(isFenceClose('~~~  \t', { ch: '~', len: 3 })).toBe(true);
  });

  it('repeated calls with the same open stay stable (regex cache)', () => {
    const open = { ch: '`', len: 4 };
    for (let i = 0; i < 3; i += 1) {
      expect(isFenceClose('````', open)).toBe(true);
      expect(isFenceClose('```', open)).toBe(false);
    }
  });
});

describe('fenceLanguages', () => {
  it('collects the first word of each fence info string', () => {
    const src = [
      '# t',
      '',
      '```ts {1,3}',
      'const x = 1;',
      '```',
      'prose with ``` inline marks',
      '~~~rust title="r"',
      'fn main() {}',
      '~~~~',
      '```',
      'no-lang block',
      '```',
    ].join('\n');
    // Deduped; meta after the lang and lang-less fences contribute nothing.
    expect(fenceLanguages(src)).toEqual(new Set(['ts', 'rust']));
  });

  it('ignores fence-looking lines inside an open block', () => {
    const src = ['```ts', '// ```python inside', '```'].join('\n');
    expect(fenceLanguages(src)).toEqual(new Set(['ts']));
  });

  it('longer opening runs need equally long closers (commonmark nesting)', () => {
    const src = ['````md', '```ts', 'inner', '```', '````'].join('\n');
    // The inner ```ts line is body of the ```` fence, not a language.
    expect(fenceLanguages(src)).toEqual(new Set(['md']));
  });

  it('shares the 4-space indent boundary of the other scan passes', () => {
    const src = ['    ```ts', '    code', '    ```'].join('\n');
    expect(fenceLanguages(src)).toEqual(new Set());
  });

  it('scans island bodies like any other prose', () => {
    const src = [
      '<ExpandableList>',
      '```json',
      '{}',
      '```',
      '</ExpandableList>',
    ].join('\n');
    expect(fenceLanguages(src)).toEqual(new Set(['json']));
  });
});
