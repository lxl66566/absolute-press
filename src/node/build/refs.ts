import fs from 'node:fs';
import path from 'node:path';

import { glob } from 'tinyglobby';

import type { ResolvedConfig } from '../config.ts';
import { fenceLanguages } from '../markdown/fence.ts';
import { parseFrontmatter } from '../markdown/frontmatter.ts';

/** One term-reference article's scan pass: the single read every consumer shares. */
export interface ScannedRef {
  /** Reference id: file path relative to the refs dir, extension-less, posix. */
  id: string;
  /** Locale key of the refs directory the file was found in. */
  locale: string;
  /** Absolute file path. */
  filePath: string;
  /** Raw markdown source, frontmatter block included. */
  source: string;
  /** File mtime at read time; the render cache freshness key. */
  mtimeMs: number;
  /** Frontmatter `title` (string values only); null falls back to the id. */
  title: string | null;
  /** Code-fence languages of the source (renderer warm-up set). */
  fenceLangs: string[];
}

/** Result of one refs scan. */
export interface RefsScan {
  /** locale key -> id -> scanned ref; the default locale holds the fallback set. */
  byLocale: Map<string, Map<string, ScannedRef>>;
  /** True when at least one locale's refs directory exists on disk. */
  present: boolean;
}

/** Content root of one locale: the contentDir itself for the default locale,
 * `<contentDir>/<key>` for every other one (mirrors the page-tree layout). */
export function localeContentRoot(
  config: ResolvedConfig,
  localeKey: string,
): string {
  return localeKey === config.locales[0]!.key
    ? config.contentDir
    : path.join(config.contentDir, localeKey);
}

/** Locale dirs each hold their own refs folder; the default locale is the
 * fallback source for every other one (mirrors the page-tree locale layout). */
export function refsDirOf(config: ResolvedConfig, localeKey: string): string {
  return path.join(localeContentRoot(config, localeKey), config.refs!);
}

/** Whether a path lies under one of the locales' refs directories (any file
 * type; extension checks belong to the callers). */
export function isRefFile(config: ResolvedConfig, file: string): boolean {
  if (!config.refs) return false;
  const posix = file.split(path.sep).join('/');
  return config.locales.some(locale => {
    const prefix = `${refsDirOf(config, locale.key).split(path.sep).join('/')}/`;
    return posix.startsWith(prefix);
  });
}

/** Single-file scan pass shared by the tree walk and the dev watcher path. */
function readRef(dir: string, localeKey: string, rel: string): ScannedRef {
  const filePath = path.join(dir, rel);
  const source = fs.readFileSync(filePath, 'utf8');
  // Silent frontmatter parse (refs scan is the authoritative pass); the
  // ref contract recognizes only `title`, everything else is dropped.
  const { raw } = parseFrontmatter(source);
  return {
    id: rel.replace(/\.md$/, '').split(path.sep).join('/'),
    locale: localeKey,
    filePath,
    source,
    mtimeMs: fs.statSync(filePath).mtimeMs,
    title: typeof raw['title'] === 'string' ? raw['title'] : null,
    fenceLangs: [...fenceLanguages(source)],
  };
}

/**
 * Scan every locale's refs directory: one walk + one read per file. A missing
 * directory is not an error — the refs tree may be an unshipped nested repo
 * (gitlink checkout), so `present` reports it and pages degrade their `[[...]]`
 * syntax to plain text with a warning instead of failing the build.
 */
export async function scanRefs(config: ResolvedConfig): Promise<RefsScan> {
  const byLocale = new Map<string, Map<string, ScannedRef>>();
  let present = false;
  const scans = await Promise.all(
    config.locales.map(async locale => {
      const dir = refsDirOf(config, locale.key);
      if (!fs.existsSync(dir)) return null;
      const files = await glob('**/*.md', { cwd: dir });
      const refs = new Map<string, ScannedRef>();
      // Ids are the extension-less relative paths, unique per walk by
      // construction — no duplicate guard needed.
      for (const rel of files.toSorted()) {
        const ref = readRef(dir, locale.key, rel);
        refs.set(ref.id, ref);
      }
      return [locale.key, refs] as const;
    }),
  );
  for (const scan of scans) {
    if (scan === null) continue;
    present = true;
    byLocale.set(scan[0], scan[1]);
  }
  return { byLocale, present };
}

/** Re-read one ref file into an existing scan entry (dev watcher path);
 * null when the read fails (vanished/renamed mid-event — the structure
 * resync path owns those). */
export function scanRefEntry(
  config: ResolvedConfig,
  localeKey: string,
  id: string,
): ScannedRef | null {
  try {
    return readRef(refsDirOf(config, localeKey), localeKey, `${id}.md`);
  } catch {
    return null;
  }
}

/** Display title of one ref: frontmatter title, else the id's last segment. */
export function refTitle(ref: ScannedRef): string {
  return ref.title ?? ref.id.slice(ref.id.lastIndexOf('/') + 1);
}

/**
 * Resolve a ref id for a page's locale: the locale's own refs first, then the
 * default locale's. Null when neither holds the id.
 */
export function lookupRef(
  scan: RefsScan,
  id: string,
  localeKey: string,
  config: ResolvedConfig,
): ScannedRef | null {
  return (
    scan.byLocale.get(localeKey)?.get(id) ??
    scan.byLocale.get(config.locales[0]!.key)?.get(id) ??
    null
  );
}

/**
 * Locale key a rendered file belongs to, by contentDir prefix: extra-locale
 * pages live in `<contentDir>/<key>/`. Unprefixed files are the default
 * locale. Used by the renderer's term hooks, which only see MarkdownEnv.
 */
export function localeKeyOf(config: ResolvedConfig, filePath: string): string {
  const norm = filePath.split(path.sep).join('/');
  for (const locale of config.locales.slice(1)) {
    const prefix = `${config.contentDir.split(path.sep).join('/')}/${locale.key}/`;
    if (norm.startsWith(prefix)) return locale.key;
  }
  return config.locales[0]!.key;
}
