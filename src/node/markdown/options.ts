import type {
  MarkdownCodeOptions,
  MarkdownOptions,
} from '../../shared/types.ts';
import { DEFAULT_COLLAPSED_LINES } from './code-meta.ts';
import type { ImageSizeResolver } from './link-rules.ts';

/**
 * Options for `createMarkdownRenderer`. The code block shape is the shared
 * `MarkdownCodeOptions` (site config passes through it verbatim); only
 * renderer-local knobs that do not belong in the cross-agent types file
 * live here.
 */
export interface MarkdownRendererOptions extends MarkdownOptions {
  /** Default `:::` container titles by type (fallback: English labels). */
  containerTitles?: Record<string, string>;
  /**
   * Intrinsic size of a local image src (node side only — the renderer
   * itself stays fs-free). Non-null results become width/height attributes
   * on the rendered img, reserving layout space before the bytes arrive
   * (CLS); null leaves the img untouched (remote, public-root and
   * unresolvable srcs, explicit dimensions).
   */
  imageSize?: ImageSizeResolver;
  /**
   * Explicit shiki language set (raw fence languages, e.g. the site-wide
   * scan in SiteStore); the renderer drops names the bundle cannot load
   * before they reach the highlighter. `undefined` keeps the production
   * default (every bundled language); the real-shiki test file sets a
   * minimal set so its cold-start stays cheap.
   */
  shikiLangs?: readonly string[];
}

/** Default copy-button label, documented on the shared `copyLabel` option. */
export const DEFAULT_COPY_LABEL = '复制代码';

/** Fully resolved code block presentation for one renderer instance. */
export interface ResolvedCodeOptions {
  lineNumbers: boolean;
  /** `null` disables collapse. */
  collapsedLines: number | null;
  wrap: boolean;
  copyLabel: string;
}

/**
 * Merge code-option defaults with the explicit site/renderer options.
 * Site-level config flows in explicitly: `resolveConfig` fully resolves it
 * once (src/node/config.ts) and SiteStore passes `config.code` into
 * `createMarkdownRenderer` (src/node/build/site.ts), so there is no
 * module-level ambient state to leak between renderers of different sites
 * sharing one process.
 */
export function resolveCodeOptions(
  explicit?: MarkdownCodeOptions,
): ResolvedCodeOptions {
  // `collapsedLines: null` is a meaningful "disabled" — nullish coalescing
  // would swallow it into the default, so undefined-checks are deliberate.
  const collapsed =
    explicit?.collapsedLines !== undefined
      ? explicit.collapsedLines
      : DEFAULT_COLLAPSED_LINES;
  return {
    lineNumbers: explicit?.lineNumbers ?? true,
    collapsedLines: collapsed,
    wrap: explicit?.wrap ?? true,
    copyLabel: explicit?.copyLabel ?? DEFAULT_COPY_LABEL,
  };
}
