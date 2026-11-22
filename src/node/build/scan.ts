import fs from 'node:fs';
import path from 'node:path';

import type { PageFrontmatter } from '../../shared/types.ts';
import type {
  ResolvedConfig,
  SiteScanContext,
  SiteScanPage,
  VirtualPageInput,
} from '../config.ts';
import { mapWithLimit } from '../limit.ts';
import { fenceLanguages } from '../markdown/fence.ts';
import { parseFrontmatter } from '../markdown/frontmatter.ts';
import { routeOf, scanPages } from './pages.ts';
import type { PageSource } from './pages.ts';
import { localeContentRoot } from './refs.ts';

/**
 * Read/parse concurrency of the tree scan. Content files are small, so a
 * moderate pool overlaps file IO without thrashing; the walk itself stays
 * serial in scanPages and each file is still read exactly once.
 */
const SCAN_READ_LIMIT = 32;

/** One content file's scan pass: the single disk read every consumer shares. */
export interface ScannedFile {
  /** Raw markdown source, frontmatter block included. */
  source: string;
  /** File mtime at read time; the render cache freshness key in build mode. */
  mtimeMs: number;
  /** Frontmatter normalized to the framework-recognized keys. */
  frontmatter: PageFrontmatter;
  /** Parsed frontmatter as the yaml source gave it. */
  rawFrontmatter: Record<string, unknown>;
  /** Code-fence languages of the source (renderer warm-up set). */
  fenceLangs: string[];
}

/** Result of one site scan: the page inventory plus the shared read cache. */
export interface SiteScan {
  /** Page sources of the walk (route semantics included), config locale order. */
  sources: PageSource[];
  /** filePath -> scan pass; every file is read exactly once per scan. */
  files: Map<string, ScannedFile>;
}

/** Scan pass of one file's already-read source: frontmatter and fences. */
function scannedFileOf(
  filePath: string,
  source: string,
  mtimeMs: number,
  timeZone: string,
): ScannedFile {
  const { frontmatter, raw } = parseFrontmatter(source, { filePath, timeZone });
  return {
    source,
    mtimeMs,
    frontmatter,
    rawFrontmatter: raw,
    fenceLangs: [...fenceLanguages(source)],
  };
}

/**
 * Sync single-file form of the scan pass (a single read plus stat, all
 * parsing derived); the dev watcher path uses it to refresh one cache entry,
 * the tree scan batches asynchronously below. `timeZone` is the file's
 * locale zone (the caller knows it; the path alone does not).
 */
export function scanFile(filePath: string, timeZone: string): ScannedFile {
  const source = fs.readFileSync(filePath, 'utf8');
  return scannedFileOf(
    filePath,
    source,
    fs.statSync(filePath).mtimeMs,
    timeZone,
  );
}

/** Async form of scanFile for the batched tree scan. */
async function readFileScan(page: PageSource): Promise<ScannedFile> {
  const source = await fs.promises.readFile(page.filePath, 'utf8');
  // Stat after the read keeps "mtime at read time" honest.
  const stat = await fs.promises.stat(page.filePath);
  return scannedFileOf(
    page.filePath,
    source,
    stat.mtimeMs,
    page.locale.timeZone,
  );
}

/** Scan the content tree: walk once (scanPages), then read every file once. */
export async function scanSite(config: ResolvedConfig): Promise<SiteScan> {
  const sources = await scanPages(config);
  const scanned = await mapWithLimit(sources, SCAN_READ_LIMIT, page =>
    readFileScan(page),
  );
  // Same Map layout as the serial form: keys follow the sources order.
  const files = new Map<string, ScannedFile>();
  for (const [index, page] of sources.entries()) {
    // mapWithLimit fills every index before resolving.
    files.set(page.filePath, scanned[index]!);
  }
  return { sources, files };
}

/** Warning for an unparsable frontmatter date, phrased near the source file. */
function invalidDateMessage(date: string, filePath: string): string {
  return `[absolute-press] invalid frontmatter date "${date}" in ${filePath}; falling back to no date (RSS/sort)`;
}

/**
 * A frontmatter date field as an ISO string; null when absent or
 * unparsable. Null degrades silently at the consumption sites: a null
 * `date` drops the page to the sort end and out of RSS ordering, a null
 * `updated` falls back to the git commit time — siteScanPages owns the
 * unparsable-value warnings for both.
 */
export function dateFieldIso(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Assemble the hook-facing page list from the scan and the git-time map;
 * no disk IO of its own, safe to re-run after a cached single-file refresh.
 * Unparsable dates warn through `warn` — the scan pass is the authoritative
 * warning point (the renderer's re-parse stays silent) — defaulting to
 * console.warn. Callers that re-run per dev edit pass a deduping sink
 * (SiteStore.refreshScanContext) so a still-broken date does not re-warn.
 */
export function siteScanPages(
  scan: SiteScan,
  gitTimes: Map<string, string>,
  warn: (message: string) => void = msg => console.warn(msg),
): SiteScanPage[] {
  return scan.sources.map(source => {
    const file = scan.files.get(source.filePath);
    if (!file) {
      throw new Error(
        `[absolute-press] scan cache miss for ${source.filePath}`,
      );
    }
    const createdAt = dateFieldIso(file.frontmatter.date);
    // Null either for an absent or an unparsable date; only the latter warns.
    if (createdAt === null && file.frontmatter.date) {
      warn(invalidDateMessage(file.frontmatter.date, source.filePath));
    }
    // An explicit `updated` overrides the git time; an unparsable one warns
    // here (the meta re-derivation in SiteStore stays silent) and falls
    // back to the git time.
    const updated = dateFieldIso(file.frontmatter.updated);
    if (updated === null && file.frontmatter.updated) {
      warn(
        `[absolute-press] invalid frontmatter updated "${file.frontmatter.updated}" in ${source.filePath}; falling back to the git commit time`,
      );
    }
    return {
      filePath: source.filePath,
      route: source.route,
      relPath: source.relPath,
      locale: source.locale,
      frontmatter: file.frontmatter,
      rawFrontmatter: file.rawFrontmatter,
      createdAt,
      updatedAt: updated ?? gitTimes.get(source.filePath) ?? null,
    };
  });
}

/**
 * Build the `onScan` hook argument; exported for tests of the ctx contract.
 * `virtual` is the addPage collector of this hook run — entries are applied
 * to the scan by the caller (SiteStore.applyVirtualPages) after the hook
 * returns, so `pages` stays the real-file inventory for the hook itself.
 */
export function siteScanContext(
  config: ResolvedConfig,
  scan: SiteScan,
  gitTimes: Map<string, string>,
  warn?: (message: string) => void,
  virtual: VirtualPageInput[] = [],
): SiteScanContext {
  return {
    config,
    pages: siteScanPages(scan, gitTimes, warn),
    addPage: page => virtual.push(page),
  };
}

/** Scan pass of a generated page: the mtime is a hash of the source, so a
 * changed generation re-renders in build mode's mtime compare. */
export function scanVirtualFile(
  filePath: string,
  source: string,
  timeZone: string,
): ScannedFile {
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Positive int32 keeps it a plausible mtimeMs everywhere downstream.
  const mtimeMs = Math.abs(hash) + 1;
  const file = scannedFileOf(filePath, source, mtimeMs, timeZone);
  return file;
}

/** Percent-decode every segment; malformed sequences keep the raw form. */
function decodeRoute(route: string): string {
  return route
    .split('/')
    .map(seg => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');
}

/**
 * Validate one addPage input and synthesize the scan entries that make the
 * generated page indistinguishable from a markdown file at the route's
 * location (filePath under the locale root, relPath and route recomputed by
 * the same routeOf). `taken` holds routes claimed so far (real pages plus
 * earlier generated ones); a collision fails loudly instead of letting one
 * page silently shadow the other.
 */
export function virtualPageEntry(
  config: ResolvedConfig,
  input: VirtualPageInput,
  taken: ReadonlySet<string>,
): { source: PageSource; file: ScannedFile } {
  if (typeof input.route !== 'string' || typeof input.source !== 'string') {
    throw new Error(
      '[absolute-press] onScan addPage requires string `route` and `source` fields',
    );
  }
  const localeKey = input.locale ?? config.locales[0]!.key;
  const locale = config.locales.find(l => l.key === localeKey);
  if (!locale) {
    throw new Error(
      `[absolute-press] onScan addPage unknown locale '${String(localeKey)}' (configured: ${config.locales
        .map(l => l.key)
        .join(', ')})`,
    );
  }
  const route = input.route;
  if (!route.startsWith('/') || route.includes('\\')) {
    throw new Error(
      `[absolute-press] onScan addPage route must be a locale-relative clean route starting with '/', got '${route}'`,
    );
  }
  if (decodeRoute(route) === '/') {
    throw new Error(
      "[absolute-press] onScan addPage route '/' is the site home — write it as a real content page",
    );
  }
  // Route -> the would-be file, mirroring routeOf's index semantics: a
  // trailing slash denotes the directory index page, anything else a leaf.
  const relPath = route.endsWith('/')
    ? `${route.slice(1)}index.md`
    : `${route.slice(1)}.md`;
  // Canonical round-trip against the prefix-less form (the input is
  // locale-relative): non-canonical shapes per directoryIndex mode
  // ('/friends/' in bare mode) are rejected for free.
  if (
    decodeRoute(routeOf(relPath, '', config.urls.directoryIndex)) !==
    decodeRoute(route)
  ) {
    const canonical = routeOf(relPath, '', config.urls.directoryIndex);
    throw new Error(
      `[absolute-press] onScan addPage route '${route}' is not canonical for directoryIndex '${config.urls.directoryIndex}' (expected '${canonical}')`,
    );
  }
  const canonical = routeOf(relPath, locale.prefix, config.urls.directoryIndex);
  if (taken.has(canonical)) {
    throw new Error(
      `[absolute-press] onScan addPage route ${canonical} already exists (a content page or another generated page)`,
    );
  }
  const filePath = path.join(localeContentRoot(config, locale.key), relPath);
  return {
    source: { filePath, locale, relPath, route: canonical },
    file: scanVirtualFile(filePath, input.source, locale.timeZone),
  };
}
