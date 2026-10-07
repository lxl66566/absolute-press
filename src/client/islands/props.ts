/**
 * Shared island prop parsing helpers.
 */

/**
 * Island props accept JSON booleans or their string spellings
 * (`:mask="true"` / `mask` / `mask=""` / `mask="false"`). `''` means the
 * bare-attribute form, which resolves to the fallback; explicit
 * 'false'/'0' spellings are always off, everything else truthy-string is on.
 * Islands whose flag defaults to off pass no fallback.
 */
export function flagOn(
  value: boolean | string | undefined,
  fallback = false,
): boolean {
  if (value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value !== 'false' && value !== '0';
}
