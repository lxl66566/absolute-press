const pad = (n: number): string => String(n).padStart(2, '0');

/** Format an ISO/`yyyy-MM-dd` date string as `yyyy-MM-dd`; null when invalid. */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
