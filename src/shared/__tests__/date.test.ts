import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A UTC- host pins the drift direction: local-component getters would turn
// UTC-midnight dates into the previous day here. TZ must be assigned before
// the SUT import (hoisted static imports would run first).
process.env.TZ = 'America/New_York';

let date: typeof import('../date.ts');

beforeAll(async () => {
  date = await import('../date.ts');
});

afterAll(() => {
  delete process.env.TZ;
});

describe('formatDate (TZ=America/New_York)', () => {
  it('defaults to the UTC calendar', () => {
    expect(date.formatDate('2024-12-31')).toBe('2024-12-31');
    expect(date.formatDate('2024-12-31T00:00:00.000Z')).toBe('2024-12-31');
    expect(date.formatDate('2024-12-31T23:30:00.000Z')).toBe('2024-12-31');
    expect(date.formatDate('2024-12-31T18:00:00-05:00')).toBe('2024-12-31');
  });

  it('renders on the configured zone, DST rules included', () => {
    // A +08 author commits at Beijing 02:00; the UTC instant is the
    // previous evening and renders on the author's day in their zone.
    expect(date.formatDate('2024-12-31T18:00:00Z', 'Asia/Shanghai')).toBe(
      '2025-01-01',
    );
    expect(date.formatDate('2024-12-31T18:00:00.000Z', 'UTC')).toBe(
      '2024-12-31',
    );
    // America/New_York runs -04:00 in summer, -05:00 in winter.
    expect(date.formatDate('2024-07-04T16:00:00Z', 'America/New_York')).toBe(
      '2024-07-04',
    );
    expect(date.formatDate('2024-12-31T04:30:00Z', 'America/New_York')).toBe(
      '2024-12-30',
    );
    // Half-hour offsets (Asia/Kolkata +05:30).
    expect(date.formatDate('2024-12-31T18:30:00Z', 'Asia/Kolkata')).toBe(
      '2025-01-01',
    );
  });

  it('formats Date objects on the given calendar', () => {
    expect(date.formatDate(new Date(Date.UTC(2024, 11, 31)))).toBe(
      '2024-12-31',
    );
    expect(
      date.formatDate(new Date('2024-12-31T18:00:00Z'), 'Asia/Shanghai'),
    ).toBe('2025-01-01');
    expect(date.formatDate(new Date('not-a-date'))).toBeNull();
  });

  it('returns null for missing or invalid input', () => {
    expect(date.formatDate(null)).toBeNull();
    expect(date.formatDate(undefined)).toBeNull();
    expect(date.formatDate('')).toBeNull();
    expect(date.formatDate('not-a-date')).toBeNull();
  });
});

describe('wallTimeToUtc', () => {
  it('resolves written wall components through the zone rules', () => {
    const utc = date.wallTimeToUtc;
    // Fixed +08: no DST, the offset is constant.
    expect(utc(Date.UTC(2024, 11, 31, 23, 30), 'Asia/Shanghai')).toBe(
      Date.UTC(2024, 11, 31, 15, 30),
    );
    // America/New_York: summer -04:00, winter -05:00.
    expect(utc(Date.UTC(2024, 6, 4, 12), 'America/New_York')).toBe(
      Date.UTC(2024, 6, 4, 16),
    );
    expect(utc(Date.UTC(2024, 11, 31, 23, 30), 'America/New_York')).toBe(
      Date.UTC(2025, 0, 1, 4, 30),
    );
  });

  it('keeps instants that already sit on the zone wall clock', () => {
    // UTC midnight and a zero-offset zone resolve to themselves.
    expect(date.wallTimeToUtc(Date.UTC(2024, 11, 31), 'Etc/UTC')).toBe(
      Date.UTC(2024, 11, 31),
    );
  });
});
