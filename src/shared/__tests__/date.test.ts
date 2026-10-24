import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// A UTC- host pins the drift direction: local-component getters would turn
// UTC-midnight dates into the previous day here. TZ must be assigned before
// the SUT import (hoisted static imports would run first).
process.env.TZ = 'America/New_York';

let formatDate: (typeof import('../date.ts'))['formatDate'];

beforeAll(async () => {
  ({ formatDate } = await import('../date.ts'));
});

afterAll(() => {
  delete process.env.TZ;
});

describe('formatDate (TZ=America/New_York)', () => {
  it('formats date-only strings on the UTC calendar', () => {
    expect(formatDate('2024-12-31')).toBe('2024-12-31');
  });

  it('formats the createdAt ISO form of a date-only entry without drift', () => {
    expect(formatDate('2024-12-31T00:00:00.000Z')).toBe('2024-12-31');
  });

  it('reports timestamps by their UTC wall date', () => {
    expect(formatDate('2024-12-31T23:30:00.000Z')).toBe('2024-12-31');
    expect(formatDate('2024-12-31T18:00:00-05:00')).toBe('2024-12-31');
  });

  it('formats Date objects on the UTC calendar (yaml frontmatter path)', () => {
    // js-yaml builds yaml timestamps with Date.UTC; the written date is the
    // UTC calendar date (see frontmatter.ts).
    expect(formatDate(new Date(Date.UTC(2024, 11, 31)))).toBe('2024-12-31');
    expect(formatDate(new Date('2024-12-31T23:30:00Z'))).toBe('2024-12-31');
    expect(formatDate(new Date('not-a-date'))).toBeNull();
  });

  it('returns null for missing or invalid input', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate('')).toBeNull();
    expect(formatDate('not-a-date')).toBeNull();
  });
});
