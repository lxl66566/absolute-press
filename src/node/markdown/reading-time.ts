/**
 * Build-time reading-time estimation. Mixed Chinese/English text: CJK chars
 * count as characters, latin runs count as words. Code is skimmed, not
 * read: fenced and 4-space-indented code blocks, inline code spans and
 * island tags are excluded. Island JSON props (`:box-data` can be tens of
 * KB) never count; island inner markdown does — it is real content.
 */
import { fenceOpenOf, isFenceClose, type FenceOpen } from './fence.ts';
import { extractIslands } from './islands.ts';

/** CJK reading speed (characters per minute). */
const CJK_CPM = 300;
/** Latin reading speed (words per minute). */
const LATIN_WPM = 200;

/** CJK ideographs, kana and hangul — everything that reads per character. */
const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g;
const LATIN_WORD_RE = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

/**
 * Inline code span: an N-backtick delimiter, then the shortest run closed
 * by the same N backticks. Shortest-match lets the content hold backtick
 * runs of other lengths (``a`b``); a delimiter directly followed by a
 * longer run stays ambiguous in CommonMark and is stripped greedily here —
 * acceptable for a word count.
 */
const INLINE_CODE_RE = /(`+)([^\n]*?)\1/g;

/**
 * Page content -> whole minutes (>= 1). Takes the markdown body with
 * frontmatter already stripped (the renderer parses it once for the whole
 * page); `render()` is the only production caller.
 */
export function readingMinutes(
  content: string,
  islandNames: ReadonlySet<string> = new Set(),
): number {
  const prose = stripIslandsAndCode(content, islandNames);
  const cjk = prose.match(CJK_CHAR_RE)?.length ?? 0;
  const words =
    prose.replace(CJK_CHAR_RE, ' ').match(LATIN_WORD_RE)?.length ?? 0;
  return Math.max(1, Math.ceil(cjk / CJK_CPM + words / LATIN_WPM));
}

/**
 * The island placeholder injected by `extractIslands` (see
 * `islandPlaceholder` in islands.ts — keep the shapes in sync): its div is
 * scaffolding and must not leak words into the estimate.
 */
const PLACEHOLDER_RE = /<div data-ap-island-placeholder="\d+"><\/div>/g;

/**
 * Drop island tags and props (keeping inner md — nested islands inside it
 * get the same treatment), then fenced/indented code and inline code spans.
 */
function stripIslandsAndCode(
  md: string,
  islandNames: ReadonlySet<string>,
): string {
  const { text, islands } = extractIslands(md, islandNames);
  const parts = [stripCode(text.replace(PLACEHOLDER_RE, '\n'))];
  for (const island of islands) {
    parts.push(stripIslandsAndCode(island.inner, islandNames));
  }
  return parts.join('\n');
}

/** What the previous output line was, for indented-code detection. */
type PrevLine = 'prose' | 'blank' | 'other';

/**
 * Drop fenced code blocks (closed or to EOF), 4-space-indented code blocks
 * and inline code spans. The indented-block rule is approximate CommonMark:
 * a 4+ space line opens code unless it lazily continues a paragraph (the
 * previous line was prose); the block runs through blank lines until the
 * next non-indented line. List-item continuation contexts are not tracked —
 * indented content inside list items is rare and only under-counts.
 */
function stripCode(md: string): string {
  const out: string[] = [];
  let open: FenceOpen | null = null;
  let indented = false;
  let prev: PrevLine = 'other'; // document start cannot lazily continue
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (open) {
      if (isFenceClose(line, open)) open = null;
      prev = 'other';
      continue;
    }
    const fence = fenceOpenOf(line);
    if (fence) {
      open = fence;
      prev = 'other';
      continue;
    }
    if (/^ {4}/.test(line)) {
      if (prev !== 'prose') {
        indented = true;
        prev = 'other';
        continue;
      }
      // Lazy paragraph continuation: stays prose.
    } else if (indented && line.trim() === '') {
      prev = 'other'; // blank line inside the indented block
      continue;
    }
    indented = false;
    out.push(line);
    prev = line.trim() === '' ? 'blank' : 'prose';
  }
  return out.join('\n').replace(INLINE_CODE_RE, ' ');
}
