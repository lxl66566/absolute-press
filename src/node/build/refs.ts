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

/** Refs roots of one locale: every config entry joined onto the locale's
 * content root, in config order (path.join normalizes `..` segments, so an
 * entry may sit outside the content tree). */
export function refsDirsOf(
  config: ResolvedConfig,
  localeKey: string,
): string[] {
  const base = localeContentRoot(config, localeKey);
  return config.refs!.map(entry => path.join(base, entry));
}

/** Whether a path lies under one of the locales' refs roots (any file type;
 * extension checks belong to the callers). */
export function isRefFile(config: ResolvedConfig, file: string): boolean {
  if (!config.refs) return false;
  const posix = file.split(path.sep).join('/');
  return config.locales.some(locale =>
    refsDirsOf(config, locale.key).some(dir =>
      posix.startsWith(`${dir.split(path.sep).join('/')}/`),
    ),
  );
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
 * Scan every locale's refs roots: one walk + one read per file. Roots are
 * collected in config order and their ids must stay unique — a collision
 * across roots fails the build (same root listed twice just dedupes). A
 * missing root is not an error — the refs tree may be an unshipped nested
 * repo (gitlink checkout), so `present` reports it and pages degrade their
 * `[[...]]` syntax to plain text with a warning instead of failing the build.
 */
export async function scanRefs(config: ResolvedConfig): Promise<RefsScan> {
  const byLocale = new Map<string, Map<string, ScannedRef>>();
  let present = false;
  const scans = await Promise.all(
    config.locales.map(async locale => {
      const walks = await Promise.all(
        refsDirsOf(config, locale.key).map(async dir => {
          if (!fs.existsSync(dir)) return null;
          return { dir, files: await glob('**/*.md', { cwd: dir }) };
        }),
      );
      const refs = new Map<string, ScannedRef>();
      // id -> resolved file: the duplicate guard across roots.
      const seen = new Map<string, string>();
      for (const walk of walks) {
        if (walk === null) continue;
        for (const rel of walk.files.toSorted()) {
          const ref = readRef(walk.dir, locale.key, rel);
          const resolved = path.resolve(ref.filePath);
          const prev = seen.get(ref.id);
          if (prev === resolved) continue;
          if (prev !== undefined) {
            throw new Error(
              `[absolute-press] duplicate ref id "${ref.id}": ${prev} and ${resolved} (refs roots are collected in config order; ids must stay unique across them)`,
            );
          }
          seen.set(ref.id, resolved);
          refs.set(ref.id, ref);
        }
      }
      return { key: locale.key, refs, anyRoot: walks.some(w => w !== null) };
    }),
  );
  for (const scan of scans) {
    // Locales whose roots are all missing stay out of the map entirely —
    // lookups then fall through to the default locale.
    if (!scan.anyRoot) continue;
    byLocale.set(scan.key, scan.refs);
    present = true;
  }
  return { byLocale, present };
}

/** Re-read one ref file into an existing scan entry (dev watcher path);
 * the roots are tried in config order. Null when no root holds the id
 * (vanished/renamed mid-event — the structure resync path owns those). */
export function scanRefEntry(
  config: ResolvedConfig,
  localeKey: string,
  id: string,
): ScannedRef | null {
  for (const dir of refsDirsOf(config, localeKey)) {
    try {
      return readRef(dir, localeKey, `${id}.md`);
    } catch {
      // Not in this root — keep trying the next one.
    }
  }
  return null;
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
