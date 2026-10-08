import { isExternalHref } from '../../shared/links.ts';
/**
 * Island preprocessing: registered `<PascalCase>` tags in source are replaced
 * with html placeholders (verbatim through markdown-it), then swapped for the
 * final `<div data-ap-island>` output after rendering.
 *
 * Attribute syntax: `:x` prefix means the value is JSON, otherwise a string.
 * JSON prop keys are normalized to camelCase (`:box-data` -> `boxData`),
 * matching the component prop the value is addressed to.
 * Fenced code blocks and inline code spans are never scanned; the close-tag
 * search inside an island is fence-aware too (usage examples inside the
 * island's own fenced blocks must not close it).
 */
import type { MarkdownEnv } from '../../shared/types.ts';
import { escapeHtml } from '../escape.ts';
import { fenceOpenOf, isFenceClose, type FenceOpen } from './fence.ts';

/** One island occurrence extracted from source. */
export interface IslandSpec {
  name: string;
  props: Record<string, unknown>;
  /** Raw markdown between the tags. */
  inner: string;
}

export interface IslandExtraction {
  text: string;
  islands: IslandSpec[];
}

const TAG_NAME_RE = /^<([A-Z][A-Za-z0-9]*)/;
const ATTR_RE = /^(:?\w[\w.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/;
/** Upper bound for one attribute's parse window; JSON island props (e.g.
 * ArticleCell box data) can be tens of KB, so this is generous. */
const ATTR_WINDOW = 64 * 1024;

export function islandPlaceholder(index: number): string {
  // `div` is a known html_block tag, so the placeholder always stays a
  // block-level token and passes through markdown-it verbatim.
  return `<div data-ap-island-placeholder="${index}"></div>`;
}

/** Replace registered island tags with placeholders; code spans are skipped. */
export function extractIslands(
  src: string,
  registered: ReadonlySet<string>,
  /** Source file path, only for truncation warnings. */
  filePath = '',
): IslandExtraction {
  if (registered.size === 0 || !src.includes('<'))
    return { text: src, islands: [] };
  const islands: IslandSpec[] = [];
  const chunks: string[] = [];
  let pos = 0;
  let last = 0;
  while (pos < src.length) {
    const code = src.charCodeAt(pos);
    if (code === 0x60 /* ` */ || code === 0x7e /* ~ */) {
      pos = skipCode(src, pos);
      continue;
    }
    if (code === 0x3c /* < */) {
      const island = tryParseIsland(src, pos, registered, filePath);
      if (island) {
        chunks.push(src.slice(last, pos), islandPlaceholder(islands.length));
        islands.push(island.spec);
        pos = island.end;
        last = pos;
        continue;
      }
    }
    pos += 1;
  }
  chunks.push(src.slice(last));
  return { text: chunks.join(''), islands };
}

/** Skip a fenced code block (line start, run >= 3) or an inline code span. */
function skipCode(src: string, pos: number): number {
  const marker = src.charCodeAt(pos);
  let runEnd = pos;
  while (src.charCodeAt(runEnd) === marker) runEnd += 1;
  const run = runEnd - pos;

  if (run >= 3 && isLineStart(src, pos)) {
    // Fenced block: closing fence is a run of the same char, length >= run,
    // alone on its line. Tildes are always fences; backtick runs of 3+ are
    // fences only at line start (already guaranteed here).
    const open: FenceOpen = { ch: String.fromCharCode(marker), len: run };
    let lineEnd = src.indexOf('\n', runEnd);
    if (lineEnd === -1) return src.length;
    let lineStart = lineEnd + 1;
    while (lineStart < src.length) {
      lineEnd = src.indexOf('\n', lineStart);
      const end = lineEnd === -1 ? src.length : lineEnd;
      if (isFenceClose(src.slice(lineStart, end), open)) {
        return lineEnd === -1 ? src.length : lineEnd + 1;
      }
      if (lineEnd === -1) return src.length;
      lineStart = lineEnd + 1;
    }
    return src.length;
  }

  if (marker === 0x7e) return runEnd; // '~' run mid-line: not code, move on.

  // Inline code span: a matching run of exactly `run` backticks closes it.
  let p = runEnd;
  while (p < src.length) {
    const next = src.indexOf('`', p);
    if (next === -1) return runEnd; // unclosed: literal backticks, keep scanning
    let closeEnd = next;
    while (src.charCodeAt(closeEnd) === 0x60) closeEnd += 1;
    if (closeEnd - next === run) return closeEnd;
    p = closeEnd;
  }
  return runEnd;
}

/** True when `pos` follows at most 3 spaces after a line start. */
function isLineStart(src: string, pos: number): boolean {
  let p = pos - 1;
  let spaces = 0;
  while (p >= 0 && src.charCodeAt(p) !== 0x0a /* \n */) {
    if (src.charCodeAt(p) !== 0x20 /* space */) return false;
    spaces += 1;
    p -= 1;
  }
  return spaces <= 3;
}

interface ParsedIsland {
  spec: IslandSpec;
  /** Offset just past the closing (or self-closing) tag. */
  end: number;
}

function tryParseIsland(
  src: string,
  pos: number,
  registered: ReadonlySet<string>,
  filePath: string,
): ParsedIsland | null {
  const nameMatch = TAG_NAME_RE.exec(src.slice(pos, pos + 64));
  const name = nameMatch?.[1];
  if (!name || !registered.has(name)) return null;

  let p = pos + 1 + name.length;
  const props: Record<string, unknown> = {};
  for (;;) {
    p = skipWhitespace(src, p);
    if (p >= src.length) return null;
    if (src.startsWith('/>', p)) {
      return { spec: { name, props, inner: '' }, end: p + 2 };
    }
    if (src.charCodeAt(p) === 0x3e /* > */) {
      p += 1;
      const close = findCloseTag(src, p, name);
      if (!close) return null;
      return {
        spec: { name, props, inner: src.slice(p, close.innerEnd) },
        end: close.end,
      };
    }
    const attr = parseAttr(src, p, name, filePath);
    if (!attr) return null;
    props[attr.key] = attr.value;
    p = attr.end;
  }
}

function skipWhitespace(src: string, pos: number): number {
  let p = pos;
  while (p < src.length && /\s/.test(src.charAt(p))) p += 1;
  return p;
}

function parseAttr(
  src: string,
  pos: number,
  tag: string,
  filePath: string,
): { key: string; value: unknown; end: number } | null {
  const clipped = pos + ATTR_WINDOW < src.length;
  const match = ATTR_RE.exec(src.slice(pos, pos + ATTR_WINDOW));
  if (!match || !match[1]) {
    // A parse failure with source beyond the window may be pure truncation:
    // without the warn the island silently renders as plain text.
    if (clipped) warnWindowClip(tag, filePath);
    return null;
  }
  // A match that runs into the window edge may hold a clipped value (the
  // unquoted-value branch stops at whitespace, so the tail is lost).
  if (clipped && match[0].length === ATTR_WINDOW) warnWindowClip(tag, filePath);
  const rawName = match[1];
  const rawValue = match[2];
  const end = pos + match[0].length;
  const isJson = rawName.startsWith(':');
  // JSON props model component props, whose names are camelCase; normalize
  // `:box-data` to `boxData` (Vue-style attribute spelling) so the
  // data-props JSON carries the name the component actually reads. Plain
  // string attributes pass through verbatim.
  const key = isJson
    ? rawName
        .slice(1)
        .replace(/-([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase())
    : rawName;
  // Valueless attribute: `flag` -> "true", `:flag` -> true.
  if (rawValue === undefined)
    return { key, value: isJson ? true : 'true', end };
  const text = unquote(rawValue);
  if (!isJson) return { key, value: text, end };
  try {
    const value: unknown = JSON.parse(text);
    return { key, value, end };
  } catch {
    throw new Error(`island <${tag}> prop "${key}": invalid JSON value`);
  }
}

function unquote(value: string): string {
  const first = value.charAt(0);
  if ((first === '"' || first === "'") && value.length >= 2)
    return value.slice(1, -1);
  return value;
}

/** An island attribute hit the ATTR_WINDOW boundary; the tag may render as text. */
function warnWindowClip(tag: string, filePath: string): void {
  console.warn(
    `[absolute-press] island <${tag}> attribute exceeds the ${ATTR_WINDOW}-char parse window${filePath === '' ? '' : ` in ${filePath}`}; the tag is left as plain text`,
  );
}

/**
 * Find the matching `</name>` outside fenced code, tracking same-tag nesting
 * depth. The scan is line-driven with a fence state machine: same-name tags
 * inside a fenced block (an island documenting its own usage) never affect
 * depth. A fence opened but never closed extends to the end of the source,
 * matching how markdown-it renders it.
 */
function findCloseTag(
  src: string,
  from: number,
  name: string,
): { innerEnd: number; end: number } | null {
  const tagRe = new RegExp(`</?${name}(?=[\\s/>])`, 'g');
  let depth = 1;
  let fence: FenceOpen | null = null;
  let pos = from;
  while (pos < src.length) {
    const lineEnd = src.indexOf('\n', pos);
    const segEnd = lineEnd === -1 ? src.length : lineEnd;
    // Segments entered mid-line (right after the island open tag, or after a
    // tag spanning several lines) can neither open nor close a fence.
    const atLineStart = pos === 0 || src.charCodeAt(pos - 1) === 0x0a; /* \n */
    const segment = src.slice(pos, segEnd);
    let next = lineEnd === -1 ? src.length : lineEnd + 1;
    if (fence) {
      if (isFenceClose(segment, fence)) fence = null;
    } else {
      const open = atLineStart ? fenceOpenOf(segment) : null;
      if (open) {
        fence = open;
      } else {
        tagRe.lastIndex = 0;
        for (let m = tagRe.exec(segment); m; m = tagRe.exec(segment)) {
          const at = pos + m.index;
          const tagEnd = findTagEnd(src, at);
          if (tagEnd === -1) return null;
          if (m[0].startsWith('</')) {
            depth -= 1;
            if (depth === 0) return { innerEnd: at, end: tagEnd };
          } else if (src.charCodeAt(tagEnd - 2) !== 0x2f /* / */) {
            depth += 1; // self-closing same-tag children are neutral
          }
          if (tagEnd > segEnd) {
            next = tagEnd; // tag spans lines: resume right after it, mid-line
            break;
          }
          tagRe.lastIndex = tagEnd - pos; // skip the tag's attributes
        }
      }
    }
    pos = next;
  }
  return null;
}

/** Offset just past `>` of the tag at `pos`; -1 when unterminated. */
function findTagEnd(src: string, pos: number): number {
  let quote = 0;
  for (let p = pos + 1; p < src.length; p++) {
    const code = src.charCodeAt(p);
    if (quote) {
      if (code === quote) quote = 0;
    } else if (code === 0x22 /* " */ || code === 0x27 /* ' */) {
      quote = code;
    } else if (code === 0x3e /* > */) {
      return p + 1;
    }
  }
  return -1;
}

/** Final island placeholder output; props are JSON, attribute-escaped. */
export function renderIslandDiv(spec: IslandSpec, innerHtml: string): string {
  const props = escapeHtml(JSON.stringify(spec.props));
  return `<div data-ap-island="${escapeHtml(spec.name)}" data-props="${props}">${innerHtml}</div>`;
}

/**
 * Transient marker for a build component (no inner html — these components
 * derive their content from site data, not markdown children). Survives the
 * markdown render as a plain div; the build layer (site.ts decorateContent)
 * swaps it for the component's final static HTML once the site-wide page
 * data exists. Props are URI-encoded, not entity-escaped: the node-side
 * round trip decodes them without needing an entity-unescape map.
 */
export function renderBuildComponentMarker(spec: IslandSpec): string {
  const props = encodeURIComponent(JSON.stringify(spec.props));
  return `<div data-ap-build="${escapeHtml(spec.name)}" data-props="${props}"></div>`;
}

/**
 * Resolve a ZoomedImg `src` prop through the image pipeline so relative
 * (./ ../) paths behave exactly like markdown images (asset copy + base
 * token). Absolute (/...), protocol-relative and remote URLs stay untouched.
 * Must run before `renderIslandDiv` serializes the props.
 */
export function resolveZoomedImgSrc(
  spec: IslandSpec,
  env: MarkdownEnv,
  resolveImage: (src: string, env: MarkdownEnv) => string,
): void {
  if (spec.name !== 'ZoomedImg') return;
  const src = spec.props['src'];
  if (
    typeof src !== 'string' ||
    src === '' ||
    src.startsWith('/') ||
    isExternalHref(src)
  ) {
    return;
  }
  spec.props['src'] = resolveImage(src, env);
}
