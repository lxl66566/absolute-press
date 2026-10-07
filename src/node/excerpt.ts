/**
 * Plain-text excerpt of rendered markdown HTML, shared by the RSS item
 * description and the head meta description. Full-content output would need
 * every asset token and page-relative link rewritten to absolute URLs (they
 * only resolve on-site), which duplicates the shell's base logic in a
 * fragile way — a compact preview plus the item/page link is the practical
 * shape for both consumers.
 */

/** Plain-text cap of one rss.xml item description. */
export const FEED_EXCERPT_LIMIT = 200;

/** meta/og description target length; search snippets truncate ~155-160. */
export const META_EXCERPT_LIMIT = 160;

/** Truncated excerpts end with a literal ellipsis. */
export function plainExcerpt(html: string, limit: number): string {
  const text = decodeEntities(
    html
      // Script/style bodies are invisible; a leading code fence would
      // otherwise eat the whole excerpt.
      .replace(/<(script|style|pre)\b[^>]*>[\s\S]*?<\/\1\s*>\s*/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Decode the entities markdown-it emits (&amp;, &#39;, &#x27;, …) so they
 * re-enter HTML/XML as real characters; leaving them escaped would double
 * them (&amp;amp;) after the consumer's own escaping pass.
 */
function decodeEntities(text: string): string {
  return text.replace(
    /&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (raw, body: string): string => {
      if (!body.startsWith('#')) return NAMED_ENTITIES[body] ?? raw;
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        // Out-of-range codepoint; keep the raw escape.
        return raw;
      }
    },
  );
}
