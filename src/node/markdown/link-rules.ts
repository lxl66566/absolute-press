import type { MarkdownIt, StateCore, Token } from 'markdown-it';

import { hasUriScheme, isExternalHref } from '../../shared/links.ts';
import type { CollectedLink, MarkdownEnv } from '../../shared/types.ts';
import type { ImageDimension } from '../image-size.ts';
import { getCtx } from './env.ts';

export type LinkResolver = (href: string, env: MarkdownEnv) => string | null;
export type ImageResolver = (src: string, env: MarkdownEnv) => string;
/** Intrinsic size of a local image src; null = leave the img unsized. */
export type ImageSizeResolver = (
  src: string,
  env: MarkdownEnv,
) => ImageDimension | null;

/** Protocol-relative or absolute http(s) URL (the outbound-arrow set). */
function isOutbound(href: string): boolean {
  return href.startsWith('//') || /^https?:\/\//i.test(href);
}

/** meta key of the 1-based source line stamped by `markLinkLines`. */
const LINE_KEY = 'apLine';

/** Rewrite and collect links; rewrite image src, add lazy loading + sizes. */
export function installLinkRules(
  md: MarkdownIt,
  resolveLink: LinkResolver | undefined,
  resolveImage: ImageResolver | undefined,
  imageSize: ImageSizeResolver | undefined,
): void {
  md.core.ruler.after('inline', 'ap-link-lines', markLinkLines);
  md.renderer.rules['link_open'] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token) {
      const hrefIndex = token.attrIndex('href');
      const hrefValue =
        hrefIndex >= 0 ? token.attrs?.[hrefIndex]?.[1] : undefined;
      if (typeof hrefValue === 'string' && hrefValue !== '') {
        const ctx = getCtx(env);
        const link = resolveHref(hrefValue, ctx.env, resolveLink);
        const line = linkLineOf(token);
        if (line !== undefined) link.line = line;
        ctx.links.push(link);
        const attr =
          link.kind === 'internal' && !link.dead
            ? token.attrs?.[hrefIndex]
            : undefined;
        if (attr) attr[1] = link.resolved;
        // Outbound http(s) links get the `ap-external` hook; content.css
        // draws the old-site ::after arrow on it. Same-site assets
        // (`../rss.xml`, images) and non-http schemes (mailto) stay bare.
        if (link.kind === 'external' && isOutbound(hrefValue)) {
          token.attrJoin('class', 'ap-external');
        }
      }
    }
    return self.renderToken(tokens, idx, options);
  };

  const defaultImage =
    md.renderer.rules['image'] ??
    ((tokens, idx, options, _env, self) =>
      self.renderToken(tokens, idx, options));
  md.renderer.rules['image'] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token) {
      const srcIndex = token.attrIndex('src');
      const srcValue = srcIndex >= 0 ? token.attrs?.[srcIndex]?.[1] : undefined;
      const src = typeof srcValue === 'string' ? srcValue : '';
      // http(s)/data:/protocol-relative urls stay untouched.
      if (src && resolveImage && !hasUriScheme(src) && !src.startsWith('//')) {
        token.attrSet('src', resolveImage(src, getCtx(env).env));
      }
      token.attrSet('loading', 'lazy');
      // Reserve layout space against CLS: local images get their intrinsic
      // size injected at build time. Explicit dimensions win (the img-size
      // syntaxes set width/height attrs at parse time); remote and
      // unresolvable srcs stay untouched (the resolver yields null).
      if (
        src &&
        imageSize &&
        token.attrIndex('width') < 0 &&
        token.attrIndex('height') < 0
      ) {
        const dim = imageSize(src, getCtx(env).env);
        if (dim) {
          token.attrSet('width', String(dim.width));
          token.attrSet('height', String(dim.height));
        }
      }
    }
    return defaultImage(tokens, idx, options, env, self);
  };
}

/**
 * Classify and rewrite a link href. The fragment (including `#:~:text=`
 * scroll-text fragments) is split off and re-appended to the resolved route
 * verbatim, so `resolveLink` only ever sees the `.md` path.
 */
function resolveHref(
  raw: string,
  env: MarkdownEnv,
  resolveLink: LinkResolver | undefined,
): CollectedLink {
  if (raw.startsWith('#')) {
    return { raw, resolved: raw, kind: 'anchor', dead: false };
  }
  if (isExternalHref(raw)) {
    return { raw, resolved: raw, kind: 'external', dead: false };
  }
  const hashIndex = raw.indexOf('#');
  const path = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : raw.slice(hashIndex);
  if (isMarkdownLink(path)) {
    const route = resolveLink ? resolveLink(path, env) : null;
    // Dead link: keep the raw href; the build layer reports it.
    if (route === null)
      return { raw, resolved: raw, kind: 'internal', dead: true };
    return { raw, resolved: route + fragment, kind: 'internal', dead: false };
  }
  // Bare relative markdown link (no `./` `../` prefix): same shape as
  // isMarkdownLink accepts, minus the explicit prefixes. Passed through
  // unrewritten; the site strictLinks policy reports it at build.
  if (isBareMarkdownLink(path)) {
    return { raw, resolved: raw, kind: 'external', dead: false, bare: true };
  }
  // Every other relative/absolute URL: pass through untouched.
  return { raw, resolved: raw, kind: 'external', dead: false };
}

/**
 * A `./`/`../` link counts as a markdown link when it points at a `.md`
 * file or has no file extension (VuePress semantics: `./x` resolves to
 * `./x.md` or a directory index). Links with another extension
 * (`../rss.xml`, `./a.png`) pass through untouched.
 *
 * Known boundaries, deliberate: the `.md` suffix check is case-sensitive
 * (`./x.MD` counts as external and skips the dead-link check), there is no
 * query-string semantics (`./x.md?v` is external because the last segment
 * no longer ends with `.md`), and a trailing slash is passed to the
 * resolver as written (`./x.md/`; the resolver normalizes it away).
 */
function isMarkdownLink(path: string): boolean {
  if (!path.startsWith('./') && !path.startsWith('../')) return false;
  const trimmed = path.replace(/\/+$/, '');
  const last = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return last.endsWith('.md') || !last.includes('.');
}

/**
 * Bare relative markdown link: the markdown-link shape (a `.md` last
 * segment or an extension-less last segment) without the `./` `../`
 * prefix and not site-absolute. Such links ship pointing at the raw `.md`
 * path — almost always a typo for `./…`; the strictLinks policy reports
 * them. Fragment-only and scheme links never reach here.
 */
function isBareMarkdownLink(path: string): boolean {
  if (path === '') return false;
  if (path.startsWith('/') || path.startsWith('./') || path.startsWith('../')) {
    return false;
  }
  const trimmed = path.replace(/\/+$/, '');
  const last = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return last.endsWith('.md') || !last.includes('.');
}

/**
 * Stamp the 1-based source line onto link_open tokens for the collect rule.
 * Inline tokens carry their block's map, so a link reports the start line
 * of its own line run (a link later in a multi-line paragraph reports the
 * paragraph start). Island-inner fragments skip the stamp via their `docId`
 * env: fragment-relative lines would mislead the dead-link report. Nothing
 * else writes `link_open.meta`, so the object is replaced outright.
 */
function markLinkLines(state: StateCore): boolean {
  if (state.env['docId'] !== undefined) return true;
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.map) continue;
    const line = (token.map[0] ?? 0) + 1;
    for (const child of token.children ?? []) {
      if (child.type === 'link_open') child.meta = { [LINE_KEY]: line };
    }
  }
  return true;
}

function isLineMeta(value: unknown): value is { [LINE_KEY]: unknown } {
  return typeof value === 'object' && value !== null && LINE_KEY in value;
}

/** Source line stamped by `markLinkLines`; undefined when absent. */
function linkLineOf(token: Token): number | undefined {
  const raw: unknown = token.meta;
  if (!isLineMeta(raw)) return undefined;
  const line = raw[LINE_KEY];
  return typeof line === 'number' ? line : undefined;
}
