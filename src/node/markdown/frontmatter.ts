import matter from 'gray-matter';

import { formatDate } from '../../shared/date.ts';
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
  if (typeof date === 'string') frontmatter.date = normalizeDateString(date);
  else if (date instanceof Date) {
    // yaml Date: the UTC calendar date IS the written one (js-yaml builds
    // timestamps with Date.UTC — see shared/date.ts formatDate). Only stamps
    // with seconds reach here as Dates; zoneless second-less stamps stay
    // plain strings and go through normalizeDateString above.
    const formatted = formatDate(date);
    if (formatted !== null) frontmatter.date = formatted;
  }

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
  const description = raw['description'];
  if (typeof description === 'string') frontmatter.description = description;

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
  'description',
]);

/**
 * Quoted zoneless `yyyy-MM-dd[ T]hh:mm[:ss]` stamps: rewritten to the ISO
 * `T`/`Z` form so downstream `new Date()` reads the written components as
 * UTC. ECMAScript parses zoneless date-time strings in the LOCAL zone,
 * which made `createdAtOf`'s toISOString drift with the build host
 * timezone; the author zone is unknowable, so UTC is the only reproducible
 * reading — the same interpretation as the yaml Date branch above.
 * Lenient on purpose: V8's fallback parser also accepts a lowercase `t`,
 * separator runs, and single-component digits (all read in the local
 * zone), so the pattern matches them too instead of leaving the drift in
 * place for rare spellings; components are re-padded on the way out.
 * Date-only strings stay as written (spec: parsed as UTC); stamps with an
 * explicit extended offset keep it (only the separator is normalized).
 * Anything else passes through untouched.
 */
/** Zero-pad a numeric string component to two digits. */
const pad = (n: string): string => n.padStart(2, '0');

function normalizeDateString(value: string): string {
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:[ Tt]\s*|\s+)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    );
  if (!match) return value;
  const date = match[1];
  const hh = pad(match[2] ?? '');
  const mm = pad(match[3] ?? '');
  const ss = pad(match[4] ?? '0');
  const frac = match[5] ? `.${match[5]}` : '';
  const zone = match[6] ?? 'Z';
  return `${date}T${hh}:${mm}:${ss}${frac}${zone}`;
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
