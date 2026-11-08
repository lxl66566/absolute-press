import fs from 'node:fs';
import path from 'node:path';

/**
 * Incremental build output: with `build.emptyOutDir: false` (forced in the
 * plugin's config hook), vite never wipes dist. Rolldown writes the bundle
 * and every emitted asset before writeBundle runs, so the only writer left
 * for this phase is cleanup: remove files the current build no longer
 * produces (renamed hashed assets, deleted pages), keeping bundle files and
 * public-dir copies. A failed build (dead-link error in generateBundle)
 * never reaches this phase, so the previous output stays fully intact.
 *
 * File names are posix-relative to outDir on both sides (bundle keys and the
 * walk below), and every consumer runs on the build thread, so a plain
 * synchronous fs layer is the right weight.
 */

/** Directory never managed by the cleanup even when present in outDir. */
const KEEP_DIR = '.git';

/**
 * Every file under `dir`, posix paths relative to it. Missing dir reads as
 * empty (first build). Symlinks never recurse (readdirSync withFileTypes
 * flags them) and are reported like files — never touched.
 */
export function walkFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return; // vanished mid-walk; the remove pass re-checks existence
    }
    for (const entry of entries) {
      if (entry.name === KEEP_DIR) continue;
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else out.push(child);
    }
  };
  walk('');
  return out;
}

/**
 * Remove every file under `outDir` that `keep` does not own. `keep` holds the
 * bundle's file names and the public-dir copies (both written this build),
 * so this only removes stale output from previous builds.
 */
export function pruneStale(outDir: string, keep: ReadonlySet<string>): number {
  let removed = 0;
  for (const name of walkFiles(outDir)) {
    if (keep.has(name)) continue;
    const abs = path.join(outDir, name);
    // A keep entry may vanish between the walk and the removal (a
    // concurrent writer); removing nothing must not count.
    if (!fs.existsSync(abs)) continue;
    fs.rmSync(abs);
    removed += 1;
    // Prune directories the removal emptied, innermost first. rmdirSync
    // fails on a non-empty dir, which ends that chain.
    let dir = path.dirname(abs);
    while (path.relative(outDir, dir) !== '') {
      try {
        fs.rmdirSync(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }
  return removed;
}
