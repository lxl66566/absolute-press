/**
 * Render-pool worker (entry: render-pool.ts runRenderShards). Rebuilds the
 * markdown pipeline in-process — a LinkResolver copy fed the same page
 * inventory, plus the refs scan for term hooks — renders its shard, and
 * posts entries and side effects back. One message in, one out; a render
 * failure is posted as an error message instead of crashing so the stack
 * survives the boundary.
 */
import { parentPort } from 'node:worker_threads';

import { BUILD_COMPONENT_NAMES } from '../../shared/components.ts';
import type { MarkdownEnv, TermHooks } from '../../shared/types.ts';
import { META_EXCERPT_LIMIT, plainExcerpt } from '../excerpt.ts';
import { localImageSize } from '../image-size.ts';
import { createMarkdownRenderer } from '../markdown/renderer.ts';
import { LinkResolver } from './assets.ts';
import { lookupRef, localeKeyOf, refTitle } from './refs.ts';
import type { RenderShard, ShardMessage, ShardResult } from './render-pool.ts';
import { REF_SEQ_RESERVE } from './render-pool.ts';

const TERM_ID_RE = /data-term="([^"]+)"/g;

/** The worker's own dedupe state for one-shot warnings. */
const warned = new Set<string>();

function warnOnce(key: string, message: string, out: [string, string][]): void {
  if (warned.has(key)) return;
  warned.add(key);
  out.push([key, message]);
}

/** Refs data shaped as the scan the term hooks expect. */
function refLookupConfig(shard: RenderShard) {
  return { locales: shard.locales, contentDir: shard.contentDir };
}

async function renderShard(shard: RenderShard): Promise<ShardResult> {
  const cfg = refLookupConfig(shard);
  const links = new LinkResolver('build');
  links.setPages(shard.pages);
  links.setRefs(shard.refRoots);

  const warns: [string, string][] = [];
  const terms: TermHooks | undefined =
    shard.refs.size > 0
      ? {
          titleOf: (id, env) => {
            const ref = lookupRef(
              { byLocale: shard.refs, present: true },
              id,
              localeKeyOf(cfg, env.filePath),
              cfg,
            );
            return ref === null ? null : refTitle(ref);
          },
          onMiss: (id, env) => {
            // Mirror of the main-thread hook: a wholly absent refs tree is
            // the sync-time notice's business, per-id noise adds nothing.
            if (!shard.refsPresent) return;
            warnOnce(
              `term:${id}`,
              `[absolute-press] unknown term reference [[${id}]] in ${env.filePath}: no such article in the refs directory; renders as plain text`,
              warns,
            );
          },
        }
      : undefined;

  const renderer = await createMarkdownRenderer({
    resolveLink: links.resolveLink,
    resolveImage: links.resolveImage,
    imageSize: localImageSize,
    ...(terms ? { terms } : {}),
    code: shard.code,
    shikiLangs: shard.shikiLangs,
    refSeqStart: (shard.index + 1) * REF_SEQ_RESERVE,
    islands: shard.islands,
    buildComponents: new Set(BUILD_COMPONENT_NAMES),
  });
  const result: ShardResult = {
    entries: [],
    refHtml: [],
    deadLinks: links.deadLinks,
    images: [],
    warns,
  };

  // Pages first: term popover rendering needs the ids the html references.
  const htmls: string[] = [];
  for (const task of shard.tasks) {
    const env: MarkdownEnv = { filePath: task.filePath };
    if (task.lang !== undefined) env.lang = task.lang;
    const r = renderer.render(task.source, env);
    htmls.push(r.html);
    result.entries.push({
      filePath: task.filePath,
      mtimeMs: task.mtimeMs,
      result: r,
      excerpt:
        r.frontmatter.description?.trim() ||
        plainExcerpt(r.html, META_EXCERPT_LIMIT),
    });
  }

  // Refs referenced by this shard's pages. The same ref may be rendered by
  // several workers; the main thread keeps one entry per key (identical
  // except the worker-unique id prefixes, which never collide by design).
  if (shard.refs.size > 0) {
    const wanted = new Set<string>();
    for (const html of htmls) {
      for (const m of html.matchAll(TERM_ID_RE)) wanted.add(m[1]!);
    }
    for (const byId of shard.refs.values()) {
      for (const ref of byId.values()) {
        if (!wanted.has(ref.id)) continue;
        const env: MarkdownEnv = { filePath: ref.filePath };
        const lang = shard.locales.find(l => l.key === ref.locale)?.lang;
        if (lang !== undefined) env.lang = lang;
        const html = renderer.renderRef(ref.source, env);
        result.refHtml.push({
          key: `${ref.locale}/${ref.id}`,
          mtimeMs: ref.mtimeMs,
          html,
        });
      }
    }
  }

  for (const [fileName, buf] of links.images) {
    result.images.push([
      fileName,
      new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
    ]);
  }
  return result;
}

const port = parentPort;
if (port) {
  port.on('message', (shard: RenderShard) => {
    void (async () => {
      try {
        const result = await renderShard(shard);
        const msg: ShardMessage = { type: 'done', result };
        port.postMessage(msg);
      } catch (e) {
        const msg: ShardMessage = {
          type: 'error',
          message:
            e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e),
        };
        port.postMessage(msg);
      }
    })();
  });
}
