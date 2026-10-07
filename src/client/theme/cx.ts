/** Join conditional class names (static strings only, so UnoCSS can scan them). */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
