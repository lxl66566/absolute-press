import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Quoted zoneless dates used to reach `new Date()` unnormalized, which
// parses them in the LOCAL zone; a UTC- host pins the drift direction
// (`2024-12-31 23:30:00` written became next-day UTC here). TZ must be
// assigned before the SUT import (hoisted static imports would run first).
process.env.TZ = 'America/New_York';

let parseFrontmatter: (typeof import('../frontmatter.ts'))['parseFrontmatter'];

beforeAll(async () => {
  ({ parseFrontmatter } = await import('../frontmatter.ts'));
});

afterAll(() => {
  delete process.env.TZ;
});

/** Normalize a quoted date frontmatter value; '' when the key is dropped. */
const of = (src: string): string =>
  parseFrontmatter(`---\ndate: "${src}"\n---\n`).frontmatter.date ?? '';

describe('quoted date normalization (TZ=America/New_York)', () => {
  it('reads zoneless date-times as UTC regardless of the build host', () => {
    const { frontmatter } = parseFrontmatter(
      '---\ndate: "2024-12-31 23:30:00"\n---\n',
    );
    expect(frontmatter.date).toBe('2024-12-31T23:30:00Z');
    expect(new Date(frontmatter.date ?? '').toISOString()).toBe(
      '2024-12-31T23:30:00.000Z',
    );
  });

  it('normalizes seconds-less and T-separated forms the same way', () => {
    expect(of('2024-12-31 23:30')).toBe('2024-12-31T23:30:00Z');
    expect(of('2024-12-31T23:30:00')).toBe('2024-12-31T23:30:00Z');
    expect(of('2024-12-31 23:30:00.5')).toBe('2024-12-31T23:30:00.5Z');
  });

  it('normalizes lenient spellings: lowercase t, space runs, single digits', () => {
    // V8's fallback parser reads all three in the local zone: on this UTC-
    // host the unnormalized passthrough yielded 2025-01-01T04:30:00.000Z
    // for the first two (date crossed) and 2024-12-31T14:30:00.000Z for
    // the single-digit hour (+5h instant drift; with hour <= 9 a UTC- date
    // cannot cross, the instant assertion still pins the UTC reading).
    expect(of('2024-12-31t23:30:00')).toBe('2024-12-31T23:30:00Z');
    expect(of('2024-12-31  23:30')).toBe('2024-12-31T23:30:00Z');
    expect(of('2024-12-31 9:30')).toBe('2024-12-31T09:30:00Z');
    expect(of('2024-12-31 23:30:5')).toBe('2024-12-31T23:30:05Z');
    expect(new Date(of('2024-12-31  23:30')).toISOString()).toBe(
      '2024-12-31T23:30:00.000Z',
    );
  });

  it('keeps explicit offsets and date-only strings as written', () => {
    expect(of('2024-12-31 23:30:00+08:00')).toBe('2024-12-31T23:30:00+08:00');
    expect(of('2024-12-31T23:30:00+08:00')).toBe('2024-12-31T23:30:00+08:00');
    // Date-only strings are UTC by spec; keep the author's written form.
    expect(of('2024-12-31')).toBe('2024-12-31');
    expect(new Date(of('2024-12-31')).toISOString()).toBe(
      '2024-12-31T00:00:00.000Z',
    );
  });

  it('leaves unrecognized shapes untouched for the scan to warn', () => {
    expect(of('2024/12/31')).toBe('2024/12/31');
    expect(of('2024-12-31 23:30:00+0800')).toBe('2024-12-31 23:30:00+0800');
  });
});
