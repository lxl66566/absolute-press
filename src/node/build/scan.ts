import fs from 'node:fs';

import type { PageFrontmatter } from '../../shared/types.ts';
import type {
  ResolvedConfig,
  SiteScanContext,
  SiteScanPage,
} from '../config.ts';
import { mapWithLimit } from '../limit.ts';
import { fenceLanguages } from '../markdown/fence.ts';
import { parseFrontmatter } from '../markdown/frontmatter.ts';
import { scanPages } from './pages.ts';
import type { PageSource } from './pages.ts';

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
): ScannedFile {
  const { frontmatter, raw } = parseFrontmatter(source, filePath);
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
 * the tree scan batches asynchronously below.
 */
export function scanFile(filePath: string): ScannedFile {
  const source = fs.readFileSync(filePath, 'utf8');
  return scannedFileOf(filePath, source, fs.statSync(filePath).mtimeMs);
}

/** Async form of scanFile for the batched tree scan. */
async function readFileScan(filePath: string): Promise<ScannedFile> {
  const source = await fs.promises.readFile(filePath, 'utf8');
  // Stat after the read keeps "mtime at read time" honest.
  const stat = await fs.promises.stat(filePath);
  return scannedFileOf(filePath, source, stat.mtimeMs);
}

/** Scan the content tree: walk once (scanPages), then read every file once. */
export async function scanSite(config: ResolvedConfig): Promise<SiteScan> {
  const sources = await scanPages(config);
  const scanned = await mapWithLimit(sources, SCAN_READ_LIMIT, page =>
    readFileScan(page.filePath),
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
 * Frontmatter `date` as an ISO string. Null when absent or unparsable —
 * an unparsable date degrades silently here (createdAt: null drops the page
 * to the sort end and out of RSS ordering); the authoritative warning lives
 * in siteScanPages, which re-runs per dev edit and dedupes.
 */
export function createdAtOf(frontmatter: PageFrontmatter): string | null {
  const date = frontmatter.date;
  if (!date) return null;
  const parsed = new Date(date);
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
    const createdAt = createdAtOf(file.frontmatter);
    // Null either for an absent or an unparsable date; only the latter warns.
    if (createdAt === null && file.frontmatter.date) {
      warn(invalidDateMessage(file.frontmatter.date, source.filePath));
    }
    return {
      filePath: source.filePath,
      route: source.route,
      relPath: source.relPath,
      locale: source.locale,
      frontmatter: file.frontmatter,
      rawFrontmatter: file.rawFrontmatter,
      createdAt,
      updatedAt: gitTimes.get(source.filePath) ?? null,
    };
  });
}

/**
 * Build the `onScan` hook argument; exported for tests of the ctx contract.
 */
export function siteScanContext(
  config: ResolvedConfig,
  scan: SiteScan,
  gitTimes: Map<string, string>,
  warn?: (message: string) => void,
): SiteScanContext {
  return { config, pages: siteScanPages(scan, gitTimes, warn) };
}
