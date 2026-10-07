import type { MarkdownEnv, MarkdownRenderer } from '../../../shared/types.ts';
import { createMarkdownRenderer } from '../index.ts';
import type { MarkdownRendererOptions } from '../index.ts';

export const ENV: MarkdownEnv = { filePath: '/content/post.md' };

/** Renderer with a default resolver: paths containing `dead` are dead links. */
export function makeRenderer(
  options: MarkdownRendererOptions = {},
): Promise<MarkdownRenderer> {
  return createMarkdownRenderer({
    resolveLink: href =>
      href.includes('dead')
        ? null
        : `/resolved/${href.replace(/^\.\//, '').replace(/\.md$/, '.html')}`,
    resolveImage: src => `/assets/${src.replace(/^\.\//, '')}`,
    ...options,
  });
}
