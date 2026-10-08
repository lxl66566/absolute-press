import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { CollectedLink, MarkdownEnv } from '../../shared/types.ts';
import { relativeRoute } from './pages.ts';
import type { PageSource } from './pages.ts';

/** Token prefix for asset URLs; the shell rewrites it with the per-page base. */
export const ASSET_TOKEN = 'absasset:';

/** Vite dev-server URL serving an absolute fs path (handles win drive letters). */
export function devFsUrl(absPath: string): string {
  const posix = absPath.split(path.sep).join('/');
  return posix.startsWith('/') ? `/@fs${posix}` : `/@fs/${posix}`;
}

export interface DeadLink {
  file: string;
  raw: string;
  /** Source line; present for markdown links (joined from the render
   * results), absent for images and unrendered entries. */
  line?: number;
}

/**
 * Dead-link report entries: resolver records joined with the source lines
 * carried by the rendered CollectedLink entries (matched by file+raw).
 * Image dead links and entries without a render result stay line-less;
 * duplicates collapse to their first occurrence.
 */
export function deadLinkReport(
  dead: readonly DeadLink[],
  rendered: ReadonlyArray<{ file: string; links: readonly CollectedLink[] }>,
): DeadLink[] {
  const lineByKey = lineKeysOf(rendered, link => link.dead);
  const seen = new Set<string>();
  const out: DeadLink[] = [];
  for (const record of dead) {
    const key = `${record.file}${record.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = lineByKey.get(key);
    out.push(line === undefined ? record : { ...record, line });
  }
  return out;
}

/**
 * Bare-relative-link report entries: built straight from the rendered
 * CollectedLink entries (the resolver never records them); same line join
 * and duplicate collapse as deadLinkReport.
 */
export function bareLinkReport(
  rendered: ReadonlyArray<{ file: string; links: readonly CollectedLink[] }>,
): DeadLink[] {
  const lineByKey = lineKeysOf(rendered, link => link.bare === true);
  const seen = new Set<string>();
  const out: DeadLink[] = [];
  for (const page of rendered) {
    for (const link of page.links) {
      if (link.bare !== true) continue;
      const key = `${page.file}${link.raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = lineByKey.get(key);
      out.push(
        line === undefined
          ? { file: page.file, raw: link.raw }
          : { file: page.file, raw: link.raw, line },
      );
    }
  }
  return out;
}

/** file+raw -> first source line, over the links matching `keep`. */
function lineKeysOf(
  rendered: ReadonlyArray<{ file: string; links: readonly CollectedLink[] }>,
  keep: (link: CollectedLink) => boolean,
): Map<string, number> {
  const lineByKey = new Map<string, number>();
  for (const page of rendered) {
    for (const link of page.links) {
      const key = `${page.file}${link.raw}`;
      if (keep(link) && link.line !== undefined && !lineByKey.has(key)) {
        lineByKey.set(key, link.line);
      }
    }
  }
  return lineByKey;
}

/**
 * Link/image resolution injected into the markdown renderer.
 * Internal links become page-relative hrefs so any deploy base works.
 */
export class LinkResolver {
  /** Emitted image file name -> content, emitted as assets during build. */
  readonly images = new Map<string, Buffer>();
  readonly deadLinks: DeadLink[] = [];
  private readonly byFile = new Map<string, PageSource>();
  private readonly byRoute = new Map<string, PageSource>();
  /**
   * Term-ref file path -> its locale's content root. Ref markdown renders
   * once and embeds into pages at any depth, so relative links cannot become
   * page-relative hrefs; they resolve against the locale content root and
   * emit the `absasset:` token, which the shell rewrites per host page base
   * (the same mechanism copied images use).
   */
  private readonly refRoots = new Map<string, string>();

  private mode: 'dev' | 'build';

  constructor(mode: 'dev' | 'build') {
    this.mode = mode;
  }

  setMode(mode: 'dev' | 'build'): void {
    this.mode = mode;
  }

  setPages(pages: PageSource[]): void {
    // A new page set opens a fresh resolution round: dead links/images
    // recorded in an earlier round (fixed or deleted since) must not leak
    // into the new one.
    this.deadLinks.length = 0;
    this.images.clear();
    this.byFile.clear();
    this.byRoute.clear();
    this.refRoots.clear();
    for (const p of pages) {
      this.byFile.set(p.filePath, p);
      this.byRoute.set(p.route, p);
    }
  }

  /** Register the refs scan's files with their locale content roots. */
  setRefs(entries: { filePath: string; root: string }[]): void {
    for (const entry of entries) this.refRoots.set(entry.filePath, entry.root);
  }

  pageForRoute(route: string): PageSource | undefined {
    return this.byRoute.get(route);
  }

  /**
   * MarkdownOptions.resolveLink: `./x.md#anchor` -> `x#anchor` (relative).
   * VuePress-style resolution: the trailing slash is normalized away, then
   * `<path>.md`, `<path>/index.md`, `<path>/README.md` are tried in order.
   * The emitted href is page-relative between the two clean routes, so any
   * deploy base works (see relativeRoute for the directory-index shapes).
   */
  resolveLink = (href: string, env: MarkdownEnv): string | null => {
    const [pathname, anchor] = splitAnchor(href);
    const refRoot = this.refRoots.get(env.filePath);
    const source = this.byFile.get(env.filePath);
    // Ref links resolve against the locale content root (refs are not pages;
    // their hrefs must work from any embedding depth — see refRoots).
    const dir = refRoot ?? path.dirname(env.filePath);
    const bare = pathname.replace(/\/+$/, '');
    const candidates = bare.endsWith('.md')
      ? [bare]
      : [`${bare}.md`, `${bare}/index.md`, `${bare}/README.md`];
    let target: PageSource | undefined;
    for (const candidate of candidates) {
      target = this.byFile.get(path.resolve(dir, candidate));
      if (target) break;
    }
    if (!source && refRoot === undefined) {
      this.deadLinks.push({ file: env.filePath, raw: href });
      return null;
    }
    if (!target) {
      this.deadLinks.push({ file: env.filePath, raw: href });
      return null;
    }
    if (refRoot !== undefined) {
      // Root-relative token; applyAssetBase (shell) swaps in the host page's
      // base prefix, so the same ref html works at every depth.
      return `${ASSET_TOKEN}${target.route.replace(/^\/+/, '')}${anchor}`;
    }
    const rel = relativeRoute(source!.route, target.route);
    return anchor ? `${rel}${anchor}` : rel;
  };

  /** MarkdownOptions.resolveImage: copies the file (build) or /@fs it (dev). */
  resolveImage = (src: string, env: MarkdownEnv): string => {
    if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
    if (src.startsWith('/')) return src;
    const abs = path.resolve(path.dirname(env.filePath), src);
    let buf: Buffer;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      this.deadLinks.push({ file: env.filePath, raw: src });
      return src;
    }
    if (this.mode === 'dev') {
      return devFsUrl(abs);
    }
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 8);
    const ext = path.extname(abs);
    const name = path.basename(abs, ext).replace(/[^\w-]+/g, '-');
    const fileName = `assets/img/${name}.${hash}${ext}`;
    this.images.set(fileName, buf);
    return `${ASSET_TOKEN}${fileName}`;
  };
}

function splitAnchor(href: string): [string, string] {
  const i = href.indexOf('#');
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)];
}

/**
 * Rewrite asset tokens in final HTML with the page's base prefix. Only the
 * quoted attribute forms (`src="absasset:…"` / `href='absasset:…'`) are
 * rewritten: a literal `absasset:` in prose or code blocks is plain text and
 * must survive verbatim.
 */
export function applyAssetBase(html: string, base: string): string {
  return html.replace(
    /\b(src|href)=(["'])absasset:([^"']*)\2/g,
    (_m, attr: string, quote: string, rest: string) =>
      `${attr}=${quote}${base}${rest}${quote}`,
  );
}
