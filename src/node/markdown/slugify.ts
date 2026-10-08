/**
 * Heading slug algorithm ported from @mdit-vue/shared `slugify` (what
 * VuePress 2 feeds to markdown-it-anchor): NFKD normalize, strip combining
 * marks and control chars, collapse runs of special chars into one `-`,
 * strip leading/trailing `-`, prefix a leading digit with `_`, lowercase.
 * Source: https://github.com/mdit-vue/mdit-vue/blob/main/packages/shared/src/slugify.ts
 */

// eslint-disable-next-line no-control-regex -- stripping control chars is intended (upstream parity)
const rControl = /[\u0000-\u001f]/g;
// Runs of separators: whitespace, ASCII punctuation and curly quotes.
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;
const rCombining = /[\u0300-\u036f]/g;

export function slugify(str: string): string {
  return (
    str
      .normalize('NFKD')
      // Strip accents (combining diacritics split off by NFKD).
      .replace(rCombining, '')
      // Strip control chars (softbreak newlines never reach here; defensive).
      .replace(rControl, '')
      // Collapse each run of special chars into a single `-`.
      .replace(rSpecial, '-')
      // Collapse consecutive separators.
      .replace(/-{2,}/g, '-')
      // Strip leading/trailing separators.
      .replace(/^-+|-+$/g, '')
      // Ensure it doesn't start with a digit.
      .replace(/^(\d)/, '_$1')
      .toLowerCase()
  );
}

/**
 * Per-render dedupe with markdown-it-anchor semantics: the first heading
 * keeps the base slug, repeats get `-1`, `-2`, ... Shared across island
 * fragments of one page so ids never collide. Term-ref renders pass a
 * prefix so popover heading ids cannot collide with the host page's.
 */
export class Slugger {
  readonly #seen = new Set<string>();
  readonly #prefix: string;

  constructor(prefix = '') {
    this.#prefix = prefix;
  }

  slug(str: string): string {
    const base = this.#prefix + slugify(str);
    let slug = base;
    let i = 1;
    while (this.#seen.has(slug)) {
      slug = `${base}-${i}`;
      i += 1;
    }
    this.#seen.add(slug);
    return slug;
  }
}
