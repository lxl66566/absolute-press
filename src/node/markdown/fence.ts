/**
 * Fenced-code detection shared by the markdown scanning passes (island
 * extraction, entry splitting, reading time). A fence opens with a 3+ run of
 * ``` or ~~~ at a line start (<= 3 spaces indent) and closes with a same-char
 * run of >= open length alone on its line.
 *
 * Known boundary: fences indented 4+ spaces (inside list items) are not
 * tracked — the line-based scans treat such lines as prose.
 */

/** An open fenced code block: marker char and its run length. */
export interface FenceOpen {
  ch: string;
  len: number;
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;

export function fenceOpenOf(line: string): FenceOpen | null {
  const m = FENCE_OPEN_RE.exec(line);
  const run = m?.[1];
  if (!run) return null;
  return { ch: run.charAt(0), len: run.length };
}

/** Closing-fence regexes per `(ch, len)`: this runs per line of every scan
 * pass and only a handful of distinct fences occur per site. Regexes are
 * stateless (no /g flag), so sharing them across calls is safe. */
const CLOSE_RES = new Map<string, RegExp>();

/** Closing fence: run of the same char, >= open length, alone on the line.
 * `\r` is tolerated so CRLF sources need no pre-normalization. */
export function isFenceClose(line: string, open: FenceOpen): boolean {
  const key = `${open.ch}:${open.len}`;
  let re = CLOSE_RES.get(key);
  if (!re) {
    re = new RegExp(`^ {0,3}\\${open.ch}{${open.len},}[ \\t\\r]*$`);
    CLOSE_RES.set(key, re);
  }
  return re.test(line);
}

/**
 * Languages referenced by fenced code blocks in a markdown source: the first
 * word of each fence's info string, the same token the fence renderer passes
 * to the highlighter. Sizes shiki's language set at renderer creation
 * instead of loading every bundled grammar. Shares the scan boundary of the
 * other passes: fences indented 4+ spaces are prose.
 */
export function fenceLanguages(src: string): Set<string> {
  const langs = new Set<string>();
  let open: FenceOpen | null = null;
  for (const line of src.split('\n')) {
    if (open !== null) {
      if (isFenceClose(line, open)) open = null;
      continue;
    }
    const m = FENCE_OPEN_RE.exec(line);
    const run = m?.[1] ?? '';
    if (run === '' || !m) continue;
    open = { ch: run.charAt(0), len: run.length };
    const lang = line.slice(m[0].length).trim().split(/\s+/)[0] ?? '';
    if (lang !== '') langs.add(lang);
  }
  return langs;
}
