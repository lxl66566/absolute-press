import type { Env } from 'markdown-it';

import type { MarkdownEnv, MarkdownRenderer } from '../../../shared/types.ts';
import { setCtx, type AbsCtx } from '../env.ts';
import { createMarkdownRenderer } from '../index.ts';
import type { MarkdownRendererOptions } from '../index.ts';
import { Slugger } from '../slugify.ts';

export const ENV: MarkdownEnv = { filePath: '/content/post.md' };

/** Renderer with a default resolver: paths containing `dead` are dead links. */
export function makeRenderer(
  options: MarkdownRendererOptions = {},
): Promise<MarkdownRenderer> {
  return createMarkdownRenderer({
    // The resolver contract includes the fragment: split it off for the
    // dead-link check, re-append verbatim (like the production resolver).
    resolveLink: href => {
      const hashIndex = href.indexOf('#');
      const path = hashIndex === -1 ? href : href.slice(0, hashIndex);
      const fragment = hashIndex === -1 ? '' : href.slice(hashIndex);
      if (path.includes('dead')) return null;
      return `/resolved/${path.replace(/^\.\//, '').replace(/\.md$/, '')}${fragment}`;
    },
    resolveImage: src => `/assets/${src.replace(/^\.\//, '')}`,
    ...options,
  });
}

/** Env carrying a minimal render ctx, for direct helper/rule invocation. */
export function makeCtxEnv(env: MarkdownEnv = ENV): Env {
  const mdEnv: Env = {};
  const ctx: AbsCtx = {
    env,
    slugger: new Slugger(),
    title: null,
    headings: [],
    links: [],
    seq: { tabGroup: 0, tabInput: 0, fragment: 0, codeFold: 0 },
    tabGroupStack: [],
    islandScan: null,
  };
  setCtx(mdEnv, ctx);
  return mdEnv;
}
