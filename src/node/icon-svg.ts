/**
 * Config icon value -> standalone svg string: bare inner markup gets the
 * 24x24 currentColor wrapper (same normalization as the client FaIcon; no
 * DOMParser here — config values are site-trusted). Unknown/blank -> ''.
 * Shared by the RecentArticles build component and the static profile card.
 */
export function iconSvg(
  key: string | undefined,
  icons: Record<string, string>,
): string {
  const trimmed = (key === undefined ? undefined : icons[key])?.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('<svg')
    ? trimmed
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${trimmed}</svg>`;
}
