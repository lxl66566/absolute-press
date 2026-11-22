import matter from 'gray-matter';
import yaml from 'js-yaml';

import { wallTimeToUtc } from '../../shared/date.ts';
import type { PageFrontmatter } from '../../shared/types.ts';

export interface ParsedSource {
  frontmatter: PageFrontmatter;
  /** Every top-level yaml key with its parsed value, recognized or not. */
  raw: Record<string, unknown>;
  content: string;
}

/**
 * gray-matter's default yaml engine (js-yaml `safeLoad`) resolves yaml 1.1
 * timestamps to Date objects built with `Date.UTC`, discarding whether the
 * stamp carried an explicit offset — a Date alone cannot tell a zoneless
 * `2024-12-31 23:30:00` (written wall clock) from `...+08:00` (true
 * instant), so zone-aware interpretation is impossible downstream. The
 * timestamp type is dropped from the safe schema and nothing else changes
 * (merge keys, binary, anchors all keep working); dates arrive as written
 * strings and normalizeDateString is the single interpretation point.
 */
declare module 'js-yaml' {
  // @types/js-yaml omits instance fields the runtime Schema/Type keep
  // (the constructor inputs): needed to rebuild the safe schema without
  // one type.
  interface Schema {
    include: Schema[];
    implicit: Type[];
    explicit: Type[];
  }
  interface Type {
    tag: string;
  }
}

const TIMESTAMP_TAG = 'tag:yaml.org,2002:timestamp';
const NO_TIMESTAMP_SCHEMA = new yaml.Schema({
  include: yaml.SAFE_SCHEMA.include,
  implicit: yaml.SAFE_SCHEMA.implicit.filter(t => t.tag !== TIMESTAMP_TAG),
  explicit: yaml.SAFE_SCHEMA.explicit,
});

const MATTER_OPTIONS = {
  engines: {
    yaml: {
      parse: (src: string): Record<string, unknown> =>
        yaml.safeLoad(src, { schema: NO_TIMESTAMP_SCHEMA }) as Record<
          string,
          unknown
        >,
      stringify: yaml.safeDump,
    },
  },
};

/**
 * Extract frontmatter; only the keys used by the framework are kept in
 * `frontmatter`, `raw` carries everything for scan consumers. `filePath`
 * (when given) turns dropped keys into one console warning so typos like
 * `tags:` surface instead of vanishing; internal re-parses (renderer,
 * reading time) pass no `filePath` and stay silent — the site scan is the
 * authoritative warning site, one parse per file per scan.
 */
export function parseFrontmatter(
  src: string,
  options?: { filePath?: string; timeZone?: string },
): ParsedSource {
  const { data, content } = matter(src, MATTER_OPTIONS);
  const raw: Record<string, unknown> = data;
  const frontmatter: PageFrontmatter = {};
  const timeZone = options?.timeZone ?? 'UTC';

  const date = dateFieldValue(raw['date'], timeZone);
  if (date !== null) frontmatter.date = date;
  // `updated` accepts the same date shapes as `date` (a separate key lets
  // authors override lastmod without touching the creation date).
  const updated = dateFieldValue(raw['updated'], timeZone);
  if (updated !== null) frontmatter.updated = updated;

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

  if (options?.filePath !== undefined) {
    const unknown = Object.keys(raw).filter(key => !KNOWN_KEYS.has(key));
    if (unknown.length > 0) {
      console.warn(
        `[absolute-press] ${options.filePath}: unknown frontmatter key(s) dropped: ${unknown.join(', ')}`,
      );
    }
  }

  return { frontmatter, raw, content };
}

/** Frontmatter keys the pipeline recognizes. */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'date',
  'updated',
  'category',
  'tag',
  'icon',
  'feed',
  'overview',
  'description',
]);

/**
 * A date-shaped frontmatter value (`date` / `updated`) as its normalized
 * string, or null when the value fits neither shape (the key stays
 * unset). The yaml engine keeps every timestamp a string, so the
 * normalization below is the only interpretation date values ever get.
 */
function dateFieldValue(value: unknown, timeZone: string): string | null {
  return typeof value === 'string'
    ? normalizeDateString(value, timeZone)
    : null;
}

/** Zero-pad a numeric string component to two digits. */
const pad = (n: string): string => n.padStart(2, '0');

/** Offset minutes as an ISO zone suffix: 'Z' at zero, else '+HH:MM'. */
function offsetString(minutes: number): string {
  if (minutes === 0) return 'Z';
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${pad(String(Math.floor(abs / 60)))}:${pad(String(abs % 60))}`;
}

/**
 * Interpret one written date stamp in `timeZone`:
 * - Zoneless datetime stamps resolve to the written wall time in the
 *   zone, emitted with the resolved offset (`Z` for UTC) so every
 *   downstream `new Date()` reads the same instant on any host —
 *   ECMAScript parses zoneless date-times in the LOCAL zone, which would
 *   otherwise drift the instant with the build machine timezone.
 * - Stamps with an explicit extended offset keep it (only the separator
 *   is normalized); they carry their instant already.
 * - Date-only strings resolve to midnight in the zone. Emitted with the
 *   offset when it is nonzero so a UTC- zone cannot pull the date back a
 *   day at render time; kept as written otherwise (the default UTC zone
 *   stores the author's form verbatim).
 * - Lenient on purpose: V8's fallback parser also accepts a lowercase
 *   `t`, separator runs, and single-component digits (all read in the
 *   local zone), so the pattern matches them too instead of leaving the
 *   drift in place for rare spellings; components are re-padded on the
 *   way out. Anything else passes through untouched for the scan to warn.
 */
function normalizeDateString(value: string, timeZone: string): string {
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:[ Tt]\s*|\s+)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    );
  if (match) {
    // Defaults only satisfy the index-access type; the pattern guarantees
    // every group up to the zone.
    const [, date = '', hh = '', mm = '', ss = '0', fracDigits, zone] = match;
    const hhOut = pad(hh);
    const mmOut = pad(mm);
    const ssOut = pad(ss);
    const frac = fracDigits ? `.${fracDigits}` : '';
    if (zone !== undefined)
      return `${date}T${hhOut}:${mmOut}:${ssOut}${frac}${zone}`;
    const wallMs = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      Number(hh),
      Number(mm),
      Number(ss),
      fracDigits ? Number(fracDigits.padEnd(3, '0').slice(0, 3)) : 0,
    );
    const instant =
      timeZone === 'UTC' ? wallMs : wallTimeToUtc(wallMs, timeZone);
    return `${date}T${hhOut}:${mmOut}:${ssOut}${frac}${offsetString((wallMs - instant) / 60_000)}`;
  }
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(value)?.[1];
  if (dateOnly !== undefined && timeZone !== 'UTC') {
    const wallMs = Date.UTC(
      Number(dateOnly.slice(0, 4)),
      Number(dateOnly.slice(5, 7)) - 1,
      Number(dateOnly.slice(8, 10)),
    );
    const instant = wallTimeToUtc(wallMs, timeZone);
    return instant === wallMs
      ? value
      : `${dateOnly}T00:00:00${offsetString((wallMs - instant) / 60_000)}`;
  }
  return value;
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
