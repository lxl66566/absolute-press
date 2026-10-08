import type { MarkdownIt, StateCore } from 'markdown-it';

import type { MarkdownEnv } from '../../shared/types.ts';
import type { ImageDimension } from '../image-size.ts';
import { getCtx } from './env.ts';
import type { ImageSizeResolver } from './link-rules.ts';

/**
 * Intrinsic sizes for raw-HTML <img> tags. The markdown image syntax gets
 * width/height from the image renderer rule (link-rules.ts); an <img> written
 * as raw HTML passes through verbatim inside html_block / html_inline tokens,
 * so this core rule rewrites the token content with the same imageSize
 * resolver. Tags carrying an explicit width or height, and srcs the resolver
 * cannot size (remote, public-root, missing files), stay untouched. Raw HTML
 * is author-trusted markdown, so a tag regex — not a full HTML parser — is
 * enough (attribute values with a quoted `>` are still handled).
 */

/** One <img ...> tag; quoted attribute values may contain '>'. */
const IMG_TAG = /<img\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const SIZE_ATTR = /\b(?:width|height)\s*=/i;
/** Tag close: '>', '/>' or '/ >'; the attributes insert before it. */
const TAG_CLOSE = /\s*\/?\s*>$/;

export function installRawHtmlImageSizes(
  md: MarkdownIt,
  imageSize: ImageSizeResolver,
): void {
  // The same src recurs across a site (shared diagrams, chrome images), and
  // resolved sizes are stable per (file, src), so cache hits on the renderer
  // instance. Misses stay uncached: a file added during dev gets sized on
  // the next render, and the node-side resolver already caches reads.
  const cache = new Map<string, ImageDimension>();
  const sizeOf = (src: string, env: MarkdownEnv): ImageDimension | null => {
    const key = `${env.filePath}\n${src}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const dim = imageSize(src, env);
    if (dim) cache.set(key, dim);
    return dim;
  };

  const rewrite = (html: string, env: MarkdownEnv): string =>
    html.replace(IMG_TAG, tag => {
      // Explicit dimensions win (same contract as the image renderer rule).
      if (SIZE_ATTR.test(tag)) return tag;
      const m = SRC_ATTR.exec(tag);
      const src = m?.[1] ?? m?.[2] ?? m?.[3];
      if (!src) return tag;
      const dim = sizeOf(src, env);
      if (!dim) return tag;
      return tag.replace(
        TAG_CLOSE,
        close => ` width="${dim.width}" height="${dim.height}"${close}`,
      );
    });

  md.core.ruler.after('inline', 'ap-raw-img-size', (state: StateCore) => {
    const { env } = getCtx(state.env);
    for (const token of state.tokens) {
      if (token.type === 'html_block') {
        token.content = rewrite(token.content, env);
      } else if (token.type === 'inline') {
        for (const child of token.children ?? []) {
          if (child.type === 'html_inline') {
            child.content = rewrite(child.content, env);
          }
        }
      }
    }
    return true;
  });
}
