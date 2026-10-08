import { figure } from '@mdit/plugin-figure';
import { footnote } from '@mdit/plugin-footnote';
// Both img-size syntaxes are enabled; registration ORDER matters:
// - legacyImgSize installs an `image` rule handling `![alt](src =300x)` (the
//   source blog's syntax);
// - imgSize then inserts its rule right before that one, so it gets first
//   crack at the alt-side `![alt =300x](src)` form and legacy stays the
//   fallback for everything else.
import { imgSize, legacyImgSize } from '@mdit/plugin-img-size';
import { katex } from '@mdit/plugin-katex-slim';
import { mark } from '@mdit/plugin-mark';
import { tasklist } from '@mdit/plugin-tasklist';
import markdownItShiki from '@shikijs/markdown-it';
import MarkdownIt from 'markdown-it';
import type { Env, MarkdownIt as MarkdownItType } from 'markdown-it';
import { bundledLanguages, type BuiltinLanguage } from 'shiki';

import { isEntryListIsland } from '../../shared/islands.ts';
import type {
  MarkdownEnv,
  MarkdownRenderer,
  RenderResult,
  TermHooks,
} from '../../shared/types.ts';
import {
  CODE_META_KEY,
  countCodeLines,
  createFoldTransformer,
  lineHighlightTransformer,
  parseCodeMeta,
  resolveCollapsedLines,
  resolveWrap,
} from './code-meta.ts';
import { registerContainers } from './containers.ts';
import { renderEntryListChildren } from './entries.ts';
import { getCtx, setCtx, type AbsCtx } from './env.ts';
import { parseFrontmatter } from './frontmatter.ts';
import { headingRule } from './headings.ts';
import { heimuRule } from './heimu.ts';
import {
  extractIslands,
  islandPlaceholder,
  renderBuildComponentMarker,
  renderIslandDiv,
  resolveZoomedImgSrc,
} from './islands.ts';
import { installLinkRules } from './link-rules.ts';
import {
  resolveCodeOptions,
  type MarkdownRendererOptions,
  type ResolvedCodeOptions,
} from './options.ts';
import { installRawHtmlImageSizes } from './raw-html-images.ts';
import { readingMinutes } from './reading-time.ts';
import { Slugger } from './slugify.ts';
import { normalizeTabMarkers, registerTabs } from './tabs.ts';
import { termRule } from './term.ts';

/**
 * Inline-syntax plugins shared by every renderer: core markdown-it already
 * covers emphasis/links/code; these add the framework's inline syntaxes
 * (`$katex$`, `==mark==`, both img-size forms, `!!heimu!!`). The term-ref
 * `[[id]]` syntax needs site-provided resolution (TermHooks) and only
 * registers for renderers that pass it — the standalone inline renderer
 * (data strings) keeps double brackets literal.
 */
function useInlinePlugins(md: MarkdownItType, terms?: TermHooks): void {
  md.use(katex);
  md.use(mark);
  md.use(legacyImgSize);
  md.use(imgSize);
  md.inline.ruler.before('emphasis', 'heimu', heimuRule);
  if (terms) md.inline.ruler.before('emphasis', 'ap-term', termRule(terms));
}

/**
 * Create the markdown renderer. Async because Shiki initialization is async.
 * Pure: no file system access, no vite imports; link/image resolution is
 * injected via options.
 */
export async function createMarkdownRenderer(
  options: MarkdownRendererOptions = {},
): Promise<MarkdownRenderer> {
  const md = new MarkdownIt({ html: true });

  useInlinePlugins(md, options.terms);
  md.use(footnote);
  md.use(tasklist);
  md.use(figure);
  registerContainers(md, options.containerTitles ?? {});
  registerTabs(md);
  md.core.ruler.after('inline', 'ap-headings', headingRule);

  // Code presentation: defaults <- explicit options (site config arrives
  // fully resolved through SiteStore). Fixed per renderer instance.
  const code = resolveCodeOptions(options.code);

  const shiki = await markdownItShiki({
    // Dual themes via CSS variables: light values are inline, dark values in
    // `--shiki-dark*` vars; the theme switches under `html[data-theme="dark"]`.
    themes: { light: 'github-light', dark: 'github-dark' },
    // `undefined` = every bundled language (tests, direct renderer users);
    // SiteStore passes the site's scanned fence languages so the cold-start
    // loads only what the site uses. Unknown entries drop out here —
    // createHighlighter rejects names the bundle cannot resolve — and their
    // fences keep the fallbackLanguage plain-text rendering the full default
    // gave them.
    langs: options.shikiLangs?.filter(isBundledLang),
    defaultLanguage: PLAIN_TEXT,
    fallbackLanguage: PLAIN_TEXT,
    parseMetaString: attrs => ({ [CODE_META_KEY]: parseCodeMeta(attrs) }),
    transformers: [lineHighlightTransformer, createFoldTransformer(code)],
  });
  md.use(shiki);
  installFenceWrapper(md, code, code.copyLabel);
  installLinkRules(
    md,
    options.resolveLink,
    options.resolveImage,
    options.imageSize,
  );
  // Raw-HTML <img> tags bypass the image renderer rule; size them here.
  if (options.imageSize) installRawHtmlImageSizes(md, options.imageSize);

  // Build component names are extraction-registered too — they flow
  // through the same tag pipeline, then branch to a transient marker
  // instead of a hydration div.
  const buildComponents = options.buildComponents ?? new Set<string>();
  const islandNames = new Set<string>(buildComponents);
  for (const island of options.islands ?? []) islandNames.add(island.name);
  // Site islands opted into the `@@@` entry-list pipeline (data-backed
  // xlist pages): the build renders the static table skeleton, the island
  // fills meta cells client-side.
  const entryListIslands = new Set(
    (options.islands ?? [])
      .filter(island => island.entryList === true)
      .map(island => island.name),
  );
  // Inner-markdown misuse of a build component warned once per file+tag.
  const warnedBuildInner = new Set<string>();

  /** Render a markdown fragment; island inner md recurses through here. */
  function renderFragment(
    src: string,
    parent: AbsCtx,
    topLevel: boolean,
  ): string {
    // Fragments share slugger/links/counters with the page but keep their
    // headings out of the TOC.
    const ctx: AbsCtx = topLevel
      ? parent
      : { ...parent, title: null, headings: [] };
    const { text, islands } = extractIslands(
      normalizeTabMarkers(src),
      islandNames,
      ctx.env.filePath,
    );
    const env: Env = {};
    setCtx(env, ctx);
    if (!topLevel) {
      // Prefix footnote ids to avoid collisions with the host page.
      parent.seq.fragment += 1;
      env['docId'] = `f${parent.seq.fragment}`;
    }
    let html = md.render(text, env);
    islands.forEach((spec, index) => {
      if (buildComponents.has(spec.name)) {
        // Build components take no children — their content derives from
        // site data. Stray inner markdown is ignored, warned once per file.
        if (spec.inner.trim() !== '') {
          const key = `${ctx.env.filePath}:${spec.name}`;
          if (!warnedBuildInner.has(key)) {
            warnedBuildInner.add(key);
            console.warn(
              `[absolute-press] build component <${spec.name}> takes no children; inner markdown ignored in ${ctx.env.filePath}`,
            );
          }
        }
        const marker = renderBuildComponentMarker(spec);
        html = html.replace(islandPlaceholder(index), () => marker);
        return;
      }
      if (options.resolveImage) {
        resolveZoomedImgSrc(spec, ctx.env, options.resolveImage);
      }
      const innerHtml =
        isEntryListIsland(spec.name) || entryListIslands.has(spec.name)
          ? // Entry-list islands split their children into titled entries at
            // build time; each entry renders as its own markdown fragment. The
            // props carry the optional `columns` header labels.
            renderEntryListChildren(
              spec.inner,
              ctx,
              renderFragment,
              renderFragmentInline,
              spec.props,
            )
          : renderFragment(spec.inner, ctx, false);
      const div = renderIslandDiv(spec, innerHtml);
      // Function replacement: island HTML may contain `$` patterns.
      html = html.replace(islandPlaceholder(index), () => div);
    });
    return html;
  }

  /**
   * Render a single-line markdown fragment as inline content (xlist meta
   * cells): inline markdown still parses (links, emphasis, heimu), but block
   * parsing never runs, so data strings like ">10h" or "#1" stay literal
   * instead of becoming a blockquote or heading.
   */
  function renderFragmentInline(src: string, parent: AbsCtx): string {
    const env: Env = {};
    setCtx(env, parent);
    return md.renderInline(src, env);
  }

  function render(src: string, env: MarkdownEnv): RenderResult {
    // The site scan already parsed (and warned about) this file's
    // frontmatter; the renderer re-parse stays silent.
    const { frontmatter, content } = parseFrontmatter(src);
    const ctx: AbsCtx = {
      env,
      slugger: new Slugger(),
      title: null,
      headings: [],
      links: [],
      seq: { tabGroup: 0, tabInput: 0, fragment: 0, codeFold: 0 },
      tabGroupStack: [],
    };
    const html = renderFragment(content, ctx, true);
    return {
      html,
      title: ctx.title,
      headings: ctx.headings,
      frontmatter,
      links: ctx.links,
      // Content, not the full source: frontmatter was already stripped above.
      readingTime: readingMinutes(content, islandNames),
    };
  }

  // Ref-article renders below. Their HTML is embedded into host pages as
  // popover templates, so every per-render id (heading anchors, tab radio
  // groups, code-fold checkboxes, footnote anchors) must never collide with
  // the host's: counters are seeded past any page's range with a monotonic
  // per-ref offset, headings and footnotes get ref-unique prefixes.
  let refSeq = 0;
  const REF_SEQ_OFFSET = 1_000_000;

  function renderRef(src: string, env: MarkdownEnv): string {
    const { content } = parseFrontmatter(src);
    refSeq += 1;
    const seed = refSeq * REF_SEQ_OFFSET;
    const ctx: AbsCtx = {
      env,
      slugger: new Slugger(`ap-term-${refSeq}-`),
      title: null,
      headings: [],
      links: [],
      seq: {
        tabGroup: seed,
        tabInput: seed,
        fragment: seed,
        codeFold: seed,
      },
      tabGroupStack: [],
    };
    const menv: Env = {};
    setCtx(menv, ctx);
    // Footnote docId prefixes the plugin's ids; distinct from the page's
    // `f<n>` fragment ids.
    menv['docId'] = `t${refSeq}`;
    // No island extraction: island/build-component tags could never hydrate
    // or swap inside a popover template, so they stay literal HTML.
    return md.render(normalizeTabMarkers(content), menv);
  }

  return { render, renderRef };
}

/** Options for `createInlineMarkdownRenderer`. */
export interface InlineMarkdownRendererOptions {
  /**
   * `<html lang>` of the site's default locale, resolving the heimu tooltip
   * copy; omitted renders the default-locale copy (same fallback as pages).
   */
  lang?: string;
}

/** Standalone renderer for single-line markdown data strings. */
export interface InlineMarkdownRenderer {
  /** Render one markdown line as an inline HTML fragment. */
  render: (src: string) => string;
}

/**
 * Sync inline counterpart of `createMarkdownRenderer` for data strings
 * (project descriptions, xlist meta cells): the framework's inline syntaxes
 * only — emphasis, links, images, `$katex$`, `==mark==`, `!!heimu!!` — with
 * no block machinery (footnotes, containers, tabs, fences/shiki), so block
 * syntax stays literal (`> q` / `# h` render as text) and creation is cheap
 * enough for vite-config-time use. Strings are author-trusted like page
 * markdown: raw HTML passes through (`html: true`).
 */
export function createInlineMarkdownRenderer(
  options: InlineMarkdownRendererOptions = {},
): InlineMarkdownRenderer {
  const md = new MarkdownIt({ html: true });
  useInlinePlugins(md);
  // Rules read the render ctx from env (heimu resolves its tooltip copy via
  // ctx.env.lang); one fixed minimal ctx serves every render of the instance.
  const ctx: AbsCtx = {
    env: { filePath: '(inline)', lang: options.lang },
    slugger: new Slugger(),
    title: null,
    headings: [],
    links: [],
    seq: { tabGroup: 0, tabInput: 0, fragment: 0, codeFold: 0 },
    tabGroupStack: [],
  };
  return {
    render: (src: string): string => {
      const env: Env = {};
      setCtx(env, ctx);
      return md.renderInline(src, env);
    },
  };
}

/**
 * Shiki-loadable language check: a key of the full bundle's registry
 * (aliases included). Everything else — typos, special langs like `ansi` —
 * must not reach createHighlighter (it rejects unknown names); such fences
 * keep the fallbackLanguage plain-text rendering instead.
 */
export function isBundledLang(lang: string): lang is BuiltinLanguage {
  return lang in bundledLanguages;
}

/**
 * Shiki treats `text` as plain text at runtime but omits it from the
 * `BundledLanguage` union (minimal cast for this type gap).
 */
const PLAIN_TEXT = 'text' as BuiltinLanguage;

/**
 * Fences whose markup the client replaces or reinterprets (see
 * `upgradeMermaidFences`): no line numbers, no fold structure, no tools row.
 */
const SPECIAL_FENCE_LANGS = new Set(['mermaid']);

const COPY_ICON =
  '<svg class="ap-code__copy-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/** Success state icon: swapped in by `.is-copied` (code.css), instant. */
const COPIED_ICON =
  '<svg class="ap-code__copied-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/**
 * Wrap fenced blocks in the `ap-code` container. Code presentation is
 * resolved at build time:
 * - line numbers: `ap-code--ln` classes (gutter is pure CSS counters)
 * - wrap: default soft-wrap; `ap-code--nowrap` opts out per block/site
 * - collapse: blocks over the threshold emit a no-JS checkbox + label
 *   (`ap-code--fold is-collapsed`); the shiki fold transformer marks the
 *   hidden lines `ap-collapsible`
 */
function installFenceWrapper(
  md: MarkdownItType,
  code: ResolvedCodeOptions,
  copyLabel: string,
): void {
  md.renderer.rules['fence'] = (tokens, idx, options, env) => {
    const token = tokens[idx];
    if (!token) return '';
    // Mirror the default fence renderer: lang is the first word of info,
    // the rest is the raw meta string passed to the highlighter.
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const space = info.indexOf(' ');
    const lang = space === -1 ? info : info.slice(0, space);
    const attrs = space === -1 ? '' : info.slice(space + 1);
    const meta = parseCodeMeta(attrs);
    const highlighted = options.highlight
      ? options.highlight(token.content, lang, attrs)
      : md.utils.escapeHtml(token.content);

    const special = SPECIAL_FENCE_LANGS.has(lang);
    const totalLines = countCodeLines(token.content);
    const lineNumbers = code.lineNumbers && !special;
    const threshold = special
      ? null
      : resolveCollapsedLines(meta, code.collapsedLines);
    const fold = threshold !== null && totalLines > threshold;
    const nowrap = !special && !resolveWrap(meta, code.wrap);

    const classes = ['ap-code'];
    if (lineNumbers) classes.push('ap-code--ln');
    if (nowrap) classes.push('ap-code--nowrap');
    if (fold) classes.push('ap-code--fold', 'is-collapsed');
    const styles: string[] = [];
    if (lineNumbers) {
      // Gutter slot hugs the widest line number the block can show; CSS
      // counters alone cannot right-align 1..N digits without a fixed slot.
      styles.push(`--ap-ln-w:${String(totalLines).length}ch`);
    }
    if (fold) {
      // The fold label's CSS `content` reads the line count from this counter;
      // a custom property would substitute as a number token, which the
      // content property rejects (declaration invalid -> content: none).
      styles.push(`counter-reset:ap-lines ${totalLines}`);
    }
    const styleAttr = styles.length > 0 ? ` style="${styles.join(';')}"` : '';

    const dataAttrs: string[] = [];
    // Language label source for the runtime copy/language tools (shiki output
    // does not carry a reliable language class for every fence).
    if (lang !== '') dataAttrs.push(`data-lang="${md.utils.escapeHtml(lang)}"`);
    if (meta.title !== null)
      dataAttrs.push(`data-title="${md.utils.escapeHtml(meta.title)}"`);
    const dataStr = dataAttrs.length > 0 ? ` ${dataAttrs.join(' ')}` : '';

    // Tools row: label + copy button over the card's top-right corner. The
    // copy icon duplicates no fold behavior (fold toggle sits at the bottom).
    const tools = special
      ? ''
      : `<div class="ap-code__tools">${
          lang !== ''
            ? `<span class="ap-code__lang">${md.utils.escapeHtml(lang)}</span>`
            : ''
        }<button type="button" class="ap-code__copy" aria-label="${copyLabel}" title="${copyLabel}">${COPY_ICON}${COPIED_ICON}</button></div>\n`;

    let open = `<div class="${classes.join(' ')}"${dataStr}${styleAttr}>`;
    open += tools;
    let close = '</div>\n';
    if (fold) {
      // Visually-hidden checkbox drives the no-JS expander; the label is a
      // sibling so `input:checked ~ pre/label` selectors work.
      const ctx = getCtx(env);
      ctx.seq.codeFold += 1;
      const id = `ap-code-fold-${ctx.seq.codeFold}`;
      open += `<input type="checkbox" class="ap-code__fold-input" id="${id}">\n`;
      close = `<label class="ap-code__fold-toggle" for="${id}"></label>\n</div>\n`;
    }
    return `${open}${highlighted}${close}`;
  };
}
