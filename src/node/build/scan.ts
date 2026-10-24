import fs from 'node:fs';

import type { PageFrontmatter } from '../../shared/types.ts';
import type {
  ResolvedConfig,
  SiteScanContext,
  SiteScanPage,
} from '../config.ts';
import { fenceLanguages } from '../markdown/fence.ts';
import { parseFrontmatter } from '../markdown/frontmatter.ts';
import { scanPages } from './pages.ts';
import type { PageSource } from './pages.ts';

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

/** Read one file's scan pass: a single read plus stat, all parsing derived. */
export function scanFile(filePath: string): ScannedFile {
  const source = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, raw } = parseFrontmatter(source, filePath);
  return {
    source,
    mtimeMs: fs.statSync(filePath).mtimeMs,
    frontmatter,
    rawFrontmatter: raw,
    fenceLangs: [...fenceLanguages(source)],
  };
}

/** Scan the content tree: walk once (scanPages), then read every file once. */
export async function scanSite(config: ResolvedConfig): Promise<SiteScan> {
  const sources = await scanPages(config);
  const files = new Map<string, ScannedFile>();
  for (const page of sources) files.set(page.filePath, scanFile(page.filePath));
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
