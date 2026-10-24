/**
 * Sanitize a target directory name into a valid npm package name:
 * lowercase, invalid-character runs collapsed to dashes, edge separators
 * stripped, capped at the npm 214-char limit (re-stripping separators the
 * cut exposes), falling back to the template default when nothing valid
 * remains.
 */
const MAX_LENGTH = 214;
const FALLBACK = 'my-blog';

export function sanitizePackageName(dirName) {
  return (
    dirName
      .toLowerCase()
      .replace(/[^a-z0-9-._]+/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '')
      .slice(0, MAX_LENGTH)
      .replace(/[-._]+$/, '') || FALLBACK
  );
}
