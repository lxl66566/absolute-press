/**
 * Conservative HTML whitespace minifier for emitted pages.
 *
 * The only transformation is deleting a pure-whitespace run that sits
 * between the `>` of a block-level closing tag (or block-level void
 * tag) and the `<` of a block-level open tag, plus trimming the whole
 * document. Text nodes, comments, inline tag boundaries and raw
 * regions (pre/textarea/script/style/svg/template) are copied
 * verbatim, so rendered output never changes.
 */

const BLOCK_TAGS = new Set([
  'html',
  'head',
  'body',
  'meta',
  'link',
  'title',
  'base',
  'div',
  'main',
  'aside',
  'nav',
  'header',
  'footer',
  'section',
  'article',
  'p',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'form',
  'fieldset',
  'figure',
  'figcaption',
  'blockquote',
  'details',
  'summary',
  'address',
  'hr',
]);

// Void tags that are also block-level; only their `>` counts as a
// deletable left boundary.
const VOID_BLOCK_TAGS = new Set(['meta', 'link', 'base', 'col', 'hr']);

// Raw text regions kept verbatim; their boundaries act as inline so
// surrounding whitespace survives.
const RAW_TAGS = new Set([
  'pre',
  'textarea',
  'script',
  'style',
  'svg',
  'template',
]);

const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)/y;
const CLOSE_TAG_RE = /<\/([a-zA-Z][a-zA-Z0-9-]*)/y;

// `</name` followed by `>`, `/` or whitespace ends a raw region. Global
// flag: the search runs forward from the open tag's end (sticky would
// anchor it at the opening `>` and miss, swallowing the whole document
// into the region); lastIndex is reset before every exec.
const RAW_CLOSE_RES = new Map(
  [...RAW_TAGS].map(
    name => [name, new RegExp(`</${name}(?=[\\s/>])`, 'g')] as const,
  ),
);

function isWhitespace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

/** Index just past the `>` of the tag at `from`, honoring quoted attribute values; -1 when unterminated. */
function tagEnd(html: string, from: number): number {
  let i = from + 1;
  const len = html.length;
  while (i < len) {
    const ch = html[i];
    if (ch === '"' || ch === "'") {
      const quote = html.indexOf(ch, i + 1);
      if (quote === -1) return -1;
      i = quote + 1;
    } else if (ch === '>') {
      return i + 1;
    } else {
      i++;
    }
  }
  return -1;
}

/** True when an open tag of a block-level element starts at `pos`. */
function isBlockOpenStart(html: string, pos: number): boolean {
  OPEN_TAG_RE.lastIndex = pos;
  const match = OPEN_TAG_RE.exec(html);
  const name = match?.[1]?.toLowerCase() ?? '';
  if (!match || !BLOCK_TAGS.has(name)) return false;
  const after = html[pos + match[0].length];
  return after === '>' || after === '/' || isWhitespace(after);
}

/**
 * End index of a raw region opening at `openStart`: just past its
 * closing tag, or `html.length` when the close tag is unterminated or
 * missing (keep the remainder verbatim).
 */
function rawRegionEnd(html: string, openStart: number, name: string): number {
  const openEnd = tagEnd(html, openStart);
  if (openEnd === -1) return html.length;
  const closeRe = RAW_CLOSE_RES.get(name);
  if (!closeRe) return html.length;
  closeRe.lastIndex = openEnd;
  const close = closeRe.exec(html);
  if (!close) return html.length;
  const end = tagEnd(html, close.index);
  return end === -1 ? html.length : end;
}

export function minifyHtml(html: string): string {
  const len = html.length;
  let out = '';
  let i = 0;
  // True after consuming the `>` of a block closing or void tag: the
  // only left side from which a whitespace run may be dropped.
  let atBlockEnd = false;

  while (i < len) {
    const ch = html[i];
    if (isWhitespace(ch)) {
      let end = i + 1;
      while (end < len && isWhitespace(html[end])) end++;
      if (atBlockEnd && isBlockOpenStart(html, end)) {
        i = end; // drop the run between two block boundaries
      } else {
        out += html.slice(i, end);
        i = end;
      }
      atBlockEnd = false;
      continue;
    }

    if (ch !== '<') {
      let end = i + 1;
      while (end < len && html[end] !== '<' && !isWhitespace(html[end])) {
        end++;
      }
      out += html.slice(i, end);
      i = end;
      atBlockEnd = false;
      continue;
    }

    if (html.startsWith('<!--', i)) {
      const close = html.indexOf('-->', i + 4);
      const end = close === -1 ? len : close + 3;
      out += html.slice(i, end);
      i = end;
      atBlockEnd = false;
      continue;
    }

    CLOSE_TAG_RE.lastIndex = i;
    const closeMatch = CLOSE_TAG_RE.exec(html);
    if (closeMatch) {
      const end = tagEnd(html, i);
      if (end === -1) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, end);
      i = end;
      atBlockEnd = BLOCK_TAGS.has(closeMatch[1]?.toLowerCase() ?? '');
      continue;
    }

    OPEN_TAG_RE.lastIndex = i;
    const openMatch = OPEN_TAG_RE.exec(html);
    if (openMatch) {
      const name = openMatch[1]?.toLowerCase() ?? '';
      const end = RAW_TAGS.has(name)
        ? rawRegionEnd(html, i, name)
        : tagEnd(html, i);
      if (end === -1) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, end);
      i = end;
      atBlockEnd = VOID_BLOCK_TAGS.has(name);
      continue;
    }

    // `<!` / `<?` / stray `<`: skip past `>` without parsing innards.
    const end = tagEnd(html, i);
    const stop = end === -1 ? len : end;
    out += html.slice(i, stop);
    i = stop;
    atBlockEnd = false;
  }

  return out.trim();
}
