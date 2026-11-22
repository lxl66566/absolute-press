import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Quoted zoneless dates used to reach `new Date()` unnormalized, which
// parses them in the LOCAL zone; a UTC- host pins the drift direction
// (`2024-12-31 23:30:00` written became next-day UTC here). TZ must be
// assigned before the SUT import (hoisted static imports would run first).
process.env.TZ = 'America/New_York';

let parseFrontmatter: (typeof import('../frontmatter.ts'))['parseFrontmatter'];
let formatDate: (typeof import('../../../shared/date.ts'))['formatDate'];

beforeAll(async () => {
  ({ parseFrontmatter } = await import('../frontmatter.ts'));
  ({ formatDate } = await import('../../../shared/date.ts'));
});

afterAll(() => {
  delete process.env.TZ;
});

/**
 * Normalized frontmatter `date` of a quoted stamp; '' when the key is
 * dropped. The optional zone mirrors the caller-side locale resolution.
 */
const of = (src: string, timeZone?: string): string =>
  parseFrontmatter(`---\ndate: "${src}"\n---\n`, { timeZone }).frontmatter
    .date ?? '';

describe('quoted date normalization (default UTC zone, TZ=America/New_York)', () => {
  it('reads zoneless date-times as UTC regardless of the build host', () => {
    expect(of('2024-12-31 23:30:00')).toBe('2024-12-31T23:30:00Z');
    expect(new Date(of('2024-12-31 23:30:00')).toISOString()).toBe(
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

describe('quoted date normalization (configured zone)', () => {
  it('resolves zoneless date-times in the configured zone', () => {
    // Fixed +08: the resolved offset is the zone's, not the build host's.
    expect(of('2024-12-31 23:30:00', 'Asia/Shanghai')).toBe(
      '2024-12-31T23:30:00+08:00',
    );
    expect(
      new Date(of('2024-12-31 23:30:00', 'Asia/Shanghai')).toISOString(),
    ).toBe('2024-12-31T15:30:00.000Z');
    // America/New_York applies its DST rules to the written wall time.
    expect(of('2024-07-04 12:00:00', 'America/New_York')).toBe(
      '2024-07-04T12:00:00-04:00',
    );
    expect(of('2024-12-31 23:30:00', 'America/New_York')).toBe(
      '2024-12-31T23:30:00-05:00',
    );
  });

  it('resolves date-only entries to midnight in the configured zone', () => {
    // Without the offset a UTC- zone would pull the rendered date back a
    // day; with it the entry renders on the written date in its zone.
    expect(of('2025-01-01', 'America/New_York')).toBe(
      '2025-01-01T00:00:00-05:00',
    );
    expect(of('2024-12-31', 'Asia/Shanghai')).toBe('2024-12-31T00:00:00+08:00');
    // A zone sitting at offset zero keeps the author's written form.
    expect(of('2024-12-31', 'Europe/London')).toBe('2024-12-31');
  });

  it('keeps explicit offsets untouched under a configured zone', () => {
    // The stamp carries its instant; the zone does not override it.
    expect(of('2024-12-31 23:30:00+08:00', 'America/New_York')).toBe(
      '2024-12-31T23:30:00+08:00',
    );
  });

  it('normalizes lenient spellings under a configured zone', () => {
    expect(of('2024-12-31t23:30:00', 'Asia/Shanghai')).toBe(
      '2024-12-31T23:30:00+08:00',
    );
    expect(of('2024-12-31  9:30', 'Asia/Shanghai')).toBe(
      '2024-12-31T09:30:00+08:00',
    );
  });

  it('renders on the written calendar date in the configured zone', () => {
    // Interpretation + rendering share the zone: the shown date is always
    // the author's written one, while a UTC render of the same instant
    // would shift early/late moments (this host is UTC-).
    for (const [zone, stamp] of [
      ['Asia/Shanghai', '2024-12-31 23:30:00'],
      ['Asia/Shanghai', '2024-12-31'],
      ['America/New_York', '2025-01-01'],
      ['America/New_York', '2024-07-04 12:00:00'],
    ] as const) {
      const normalized = of(stamp, zone);
      expect(formatDate(normalized, zone)).toBe(stamp.slice(0, 10));
    }
  });
});
