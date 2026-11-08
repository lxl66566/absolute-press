import { createHash } from 'node:crypto';

import type { SearchDoc, SearchIndexAsset } from '../../shared/search.ts';

/** Dev endpoint path of the all-locales index module (see plugin.ts). */
export const DEV_SEARCH_INDEX = '@ap-search';

/**
 * Heading with its anchor id and inner markup: the renderer emits
 * `<h{1-6} id="slug">` (id is the first attribute, see markdown/headings.ts),
 * including headings inside island pre-renders — those sections are as
 * searchable as body prose.
 */
const HEADING_RE = /<h([1-6])\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g;

/** Script/style bodies are invisible; they must not pollute search text. */
const INVISIBLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Pages feed the search doc builder after rendering (EmittedPage subset). */
export interface SearchPage {
  route: string;
  locale: string;
  title: string;
  html: string;
}

/**
 * Split one rendered page into searchable sections and strip them to plain
 * text: every heading starts a section (its anchor deep-links the result),
 * and the block before the first heading becomes the page's intro section.
 * Tokenization happens client-side (shared/search.ts); here we only reduce
 * the html to decodable text so the asset stays free of markup.
 */
export function searchDocsOf(pages: readonly SearchPage[]): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const page of pages) {
    const title = page.title || page.route;
    const markers = [...page.html.matchAll(HEADING_RE)];
    const bounds: {
      anchor: string;
      heading: string;
      start: number;
      end: number;
    }[] = [];
    markers.forEach((match, i) => {
      const start = match.index ?? 0;
      const next = markers[i + 1]?.index ?? page.html.length;
      if (i === 0 && start > 0) {
        // Content before the first heading is the page's intro section.
        bounds.push({ anchor: '', heading: '', start: 0, end: start });
      }
      bounds.push({
        anchor: match[2] ?? '',
        heading: plainTextOf(match[3] ?? ''),
        start,
        end: next,
      });
    });
    if (bounds.length === 0) {
      bounds.push({ anchor: '', heading: '', start: 0, end: page.html.length });
    }
    for (const section of bounds) {
      const text = plainTextOf(page.html.slice(section.start, section.end));
      if (text === '' && section.heading === '') continue;
      docs.push({
        id:
          section.anchor === ''
            ? page.route
            : `${page.route}#${section.anchor}`,
        route: page.route,
        locale: page.locale,
        title,
        heading: section.heading,
        anchor: section.anchor,
        text,
      });
    }
  }
  return docs;
}

/** Tag-stripped, entity-decoded, whitespace-collapsed text of an html slice. */
function plainTextOf(html: string): string {
  return decodeEntities(
    html.replace(INVISIBLE_RE, ' ').replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Same entity set the excerpt decoder handles (node/excerpt.ts). */
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
        return raw;
      }
    },
  );
}

/**
 * The local-search index asset of one locale: documents as a content-hashed
 * ES module (chrome-asset pattern) — immutable-cached, name stable across
 * rebuilds until the docs actually change. The client loads it on first
 * search open and builds the MiniSearch index client-side.
 */
export function searchAsset(docs: readonly SearchDoc[]): {
  fileName: string;
  source: string;
} {
  const asset: SearchIndexAsset = { docs: [...docs] };
  const source = `export default ${JSON.stringify(asset)};\n`;
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  return { fileName: `assets/search-${hash}.js`, source };
}
