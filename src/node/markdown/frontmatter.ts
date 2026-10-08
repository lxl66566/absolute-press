import matter from 'gray-matter';

import type { PageFrontmatter } from '../../shared/types.ts';

export interface ParsedSource {
  frontmatter: PageFrontmatter;
  /** Every top-level yaml key with its parsed value, recognized or not. */
  raw: Record<string, unknown>;
  content: string;
}

/**
 * Extract frontmatter; only the keys used by the framework are kept in
 * `frontmatter`, `raw` carries everything for scan consumers. `filePath`
 * (when given) turns dropped keys into one console warning so typos like
 * `tags:` surface instead of vanishing; internal re-parses (renderer,
 * reading time) pass nothing and stay silent — the site scan is the
 * authoritative warning site, one parse per file per scan.
 */
export function parseFrontmatter(src: string, filePath?: string): ParsedSource {
  const { data, content } = matter(src);
  const raw: Record<string, unknown> = data;
  const frontmatter: PageFrontmatter = {};

  const date = raw['date'];
  if (typeof date === 'string') frontmatter.date = date;
  else if (date instanceof Date) frontmatter.date = formatDate(date);

  const category = toStringList(raw['category']);
  if (category) frontmatter.category = category;
  const tag = toStringList(raw['tag']);
  if (tag) frontmatter.tag = tag;

  const icon = raw['icon'];
  if (typeof icon === 'string') frontmatter.icon = icon;
  const feed = raw['feed'];
  if (typeof feed === 'boolean') frontmatter.feed = feed;
  const overview = raw['overview'];
  if (typeof overview === 'boolean') frontmatter.overview = overview;

  if (filePath !== undefined) {
    const unknown = Object.keys(raw).filter(key => !KNOWN_KEYS.has(key));
    if (unknown.length > 0) {
      console.warn(
        `[absolute-press] ${filePath}: unknown frontmatter key(s) dropped: ${unknown.join(', ')}`,
      );
    }
  }

  return { frontmatter, raw, content };
}

/** Frontmatter keys the pipeline recognizes. */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'date',
  'category',
  'tag',
  'icon',
  'feed',
  'overview',
]);

/**
 * Normalize a yaml Date to `yyyy-MM-dd`. js-yaml builds yaml timestamps with
 * `Date.UTC` (verified against the pinned dependency: bare dates land at UTC
 * midnight and zoneless stamps like `2024-12-31 23:30:00` keep the written
 * components as UTC ones), so the UTC calendar date IS the written date on
 * every host timezone. Local-component formatting would drift late-UTC
 * stamps into the next day on UTC+ hosts. Stamps with an explicit timezone
 * are converted to UTC first; their written wall date is not restored.
 * Zoneless stamps without seconds (js-yaml requires them) never reach here:
 * they stay plain strings and pass through the string branch above.
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Accept a single string or a string array; drop anything else. */
function toStringList(value: unknown): string[] | undefined {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    const list = value.filter(
      (item): item is string => typeof item === 'string',
    );
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}
