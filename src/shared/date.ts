/**
 * Date formatting shared by the client theme (article cards) and the node
 * build (build components). No DOM imports: node consumes this too, so
 * relative specifiers carry an explicit .ts (plain node ESM type-stripping).
 */
const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Format a date string or Date as `yyyy-MM-dd` on the UTC calendar; null
 * when invalid. UTC on purpose: frontmatter dates reach consumers normalized
 * to UTC moments (`createdAtOf` emits toISOString), so the written calendar
 * date lives in the UTC components — local getters would drift date-only
 * entries a day back on UTC- hosts and make the static RecentArticles HTML
 * depend on the build machine timezone. Timestamps (git `updatedAt`) report
 * their UTC wall date too, keeping client display identical to the built
 * HTML on every visitor timezone. The Date branch carries its own js-yaml
 * note below.
 */
export function formatDate(
  value: string | Date | null | undefined,
): string | null {
  if (value instanceof Date) {
    // js-yaml builds yaml timestamps with `Date.UTC` (bare dates land at UTC
    // midnight and zoneless stamps keep the written components as UTC ones),
    // so the UTC calendar date IS the written date on every host timezone —
    // the same reading as normalizeDateString gives the string branch in
    // frontmatter.ts. `toISOString` pads years < 1000 to the `yyyy-` shape
    // (getUTCFullYear would print a bare `500-`). Invalid Dates cannot come
    // from js-yaml; NaN maps to null instead of toISOString's RangeError so
    // the contract stays total.
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
