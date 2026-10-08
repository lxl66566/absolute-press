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

/**
 * Frontmatter `date` as an ISO string. Null when absent or unparsable —
 * an unparsable date silently degrades (createdAt: null drops the page to
 * the sort end and out of RSS ordering), so `filePath` (when given) warns
 * near the source file; internal re-derivations pass nothing and stay silent.
 */
export function createdAtOf(
  frontmatter: PageFrontmatter,
  filePath?: string,
): string | null {
  const date = frontmatter.date;
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    if (filePath !== undefined) {
      console.warn(
        `[absolute-press] invalid frontmatter date "${date}" in ${filePath}; falling back to no date (RSS/sort)`,
      );
    }
    return null;
  }
  return parsed.toISOString();
}

/**
 * Assemble the hook-facing page list from the scan and the git-time map;
 * no disk IO of its own, safe to re-run after a cached single-file refresh.
 */
export function siteScanPages(
  scan: SiteScan,
  gitTimes: Map<string, string>,
): SiteScanPage[] {
  return scan.sources.map(source => {
    const file = scan.files.get(source.filePath);
    if (!file) {
      throw new Error(
        `[absolute-press] scan cache miss for ${source.filePath}`,
      );
    }
    return {
      filePath: source.filePath,
      route: source.route,
      relPath: source.relPath,
      locale: source.locale,
      frontmatter: file.frontmatter,
      rawFrontmatter: file.rawFrontmatter,
      createdAt: createdAtOf(file.frontmatter, source.filePath),
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
): SiteScanContext {
  return { config, pages: siteScanPages(scan, gitTimes) };
}
