import type {
  ExternalizedEntryBodies,
  MarkdownEnv,
} from '../../shared/types.ts';
import { pageUsesKatex } from './katex-assets.ts';
import type { PageSource } from './pages.ts';
import { baseOf } from './shell.ts';
import { xlistAsset } from './xlist-asset.ts';

export interface EntryBodiesHookOptions {
  /** Externalization threshold in bytes (= config KiB * 1024); false never externalizes. */
  thresholdBytes: number | false;
  /** filePath -> the page the file renders as (base prefix resolution). */
  pageForFile: (filePath: string) => PageSource | undefined;
  /**
   * Called on every actual externalization: the main thread records the
   * asset for emission and the page->asset reference map; a render worker
   * collects them for its shard result.
   */
  collect?: (
    asset: { fileName: string; source: string },
    env: MarkdownEnv,
  ) => void;
}

/**
 * MarkdownOptions.entryBodies factory shared by the main-thread renderer and
 * the render workers, so pool and serial renders externalize entry-list
 * bodies identically. Only built-in entry-list islands invoke this hook —
 * the renderer itself gates the call (data-backed site islands own their
 * item pipeline client-side and stay inline).
 */
export function createEntryBodiesHook(
  opts: EntryBodiesHookOptions,
): (
  bodies: readonly string[],
  env: MarkdownEnv,
) => ExternalizedEntryBodies | null {
  if (opts.thresholdBytes === false) return () => null;
  // Const local: the false-check's narrowing must hold inside the closure.
  const thresholdBytes = opts.thresholdBytes;
  return (bodies, env) => {
    const joined = bodies.join('');
    // UTF-8 byte length: the threshold mirrors the config's KiB scale, and
    // a code-unit count would under-count CJK content ~3x.
    if (Buffer.byteLength(joined) < thresholdBytes) return null;
    const page = opts.pageForFile(env.filePath);
    if (page === undefined) return null;
    const asset = xlistAsset(bodies);
    opts.collect?.(asset, env);
    return {
      src: baseOf(page.route) + asset.fileName,
      katex: pageUsesKatex(joined),
    };
  };
}
