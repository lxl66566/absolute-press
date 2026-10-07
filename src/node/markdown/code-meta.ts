import type { ShikiTransformer } from 'shiki';

import type { ResolvedCodeOptions } from './options.ts';

/**
 * Parsed fence meta: `{1,3-5}` line highlight, `:collapsed-lines[=N]`,
 * `:wrap=true|false`, `title="..."`.
 */
export interface CodeMeta {
  /** 1-based line numbers to highlight. */
  highlightLines: number[];
  /**
   * Explicit collapse threshold; `null` with the `:no-collapsed-lines`
   * opt-out. Meaningful only together with `collapsedExplicit`.
   */
  collapsedLines: number | null;
  /** True when any `:collapsed-lines*` / `:no-collapsed-lines` token appeared. */
  collapsedExplicit: boolean;
  /** `:wrap=true|false` per-block override; `null` = unspecified. */
  wrap: boolean | null;
  title: string | null;
}

export function parseCodeMeta(attrs: string): CodeMeta {
  const meta: CodeMeta = {
    highlightLines: [],
    collapsedLines: null,
    collapsedExplicit: false,
    wrap: null,
    title: null,
  };

  const lines = /\{([\d\s,-]+)\}/.exec(attrs)?.[1];
  if (lines) {
    for (const part of lines.split(',')) {
      const range = /^(\d+)-(\d+)$/.exec(part.trim());
      const from = Number(range?.[1]);
      const to = Number(range?.[2]);
      if (
        range &&
        Number.isInteger(from) &&
        Number.isInteger(to) &&
        from <= to
      ) {
        for (let line = from; line <= to; line++)
          meta.highlightLines.push(line);
        continue;
      }
      const single = Number(part.trim());
      if (Number.isInteger(single) && single > 0)
        meta.highlightLines.push(single);
    }
  }

  // Flag matching runs on the attrs minus quoted titles, so prose like
  // title="use :wrap=false here" is never mistaken for an override.
  const flags = attrs.replace(/(title|alt)="[^"]*"|(title|alt)='[^']*'/g, '');

  if (/:no-collapsed-lines(?=$|[\s"'])/.test(flags)) {
    // Explicit opt-out wins over any `:collapsed-lines` form.
    meta.collapsedExplicit = true;
    meta.collapsedLines = null;
  } else {
    const collapsed = /:collapsed-lines=(\d+)/.exec(flags)?.[1];
    if (collapsed) {
      meta.collapsedExplicit = true;
      meta.collapsedLines = Number(collapsed);
    } else if (/:collapsed-lines(?=$|[\s"'])/.test(flags)) {
      meta.collapsedExplicit = true;
      meta.collapsedLines = DEFAULT_COLLAPSED_LINES;
    }
  }

  // Per-block wrap override: `:wrap=false` scrolls, `:wrap=true` soft-wraps.
  const wrap = /:wrap=(true|false)(?=$|[\s"'])/.exec(flags)?.[1];
  if (wrap !== undefined) meta.wrap = wrap === 'true';

  const title =
    /title="([^"]*)"/.exec(attrs)?.[1] ?? /title='([^']*)'/.exec(attrs)?.[1];
  if (title !== undefined) meta.title = title;

  return meta;
}

/**
 * Threshold for the bare `:collapsed-lines` flag (no `=N`), matching
 * vuepress-theme-hope's default of collapsing code longer than 15 lines.
 */
export const DEFAULT_COLLAPSED_LINES = 15;

/** Effective collapse threshold: explicit meta wins over the site default. */
export function resolveCollapsedLines(
  meta: CodeMeta,
  siteDefault: number | null,
): number | null {
  return meta.collapsedExplicit ? meta.collapsedLines : siteDefault;
}

/** Effective wrap: the `:wrap=` override wins over the site default. */
export function resolveWrap(meta: CodeMeta, siteDefault: boolean): boolean {
  return meta.wrap ?? siteDefault;
}

/** Physical line count of a fence body; the trailing newline is not a line. */
export function countCodeLines(content: string): number {
  const trimmed = content.replace(/\n$/, '');
  return trimmed === '' ? 0 : trimmed.split('\n').length;
}

/**
 * Meta key carrying `CodeMeta` from `parseMetaString` to the transformer.
 * Shiki copies every meta entry whose key does not start with `_` into the
 * `<pre>` attributes, so the underscore prefix keeps the object out of HTML
 * (it would otherwise render as `abs="[object Object]"`).
 */
export const CODE_META_KEY = '_abs';

function isCodeMeta(value: unknown): value is CodeMeta {
  if (typeof value !== 'object' || value === null) return false;
  return 'highlightLines' in value && Array.isArray(value.highlightLines);
}

/** Adds the `highlighted` class to lines listed in the fence meta `{...}`. */
export const lineHighlightTransformer: ShikiTransformer = {
  name: 'abs:line-highlight',
  line(node, line) {
    const raw: unknown = this.options.meta?.[CODE_META_KEY];
    if (isCodeMeta(raw) && raw.highlightLines.includes(line)) {
      this.addClassToHast(node, 'highlighted');
    }
  },
};

/**
 * Adds `ap-collapsible` to lines beyond the effective threshold; the CSS in
 * code.css hides them until the fold checkbox is checked (no-JS expanding).
 * Site-resolved defaults are bound at renderer creation.
 */
export function createFoldTransformer(
  site: ResolvedCodeOptions,
): ShikiTransformer {
  return {
    name: 'abs:code-fold',
    line(node, line) {
      const raw: unknown = this.options.meta?.[CODE_META_KEY];
      if (!isCodeMeta(raw)) return;
      const threshold = resolveCollapsedLines(raw, site.collapsedLines);
      if (threshold !== null && line > threshold) {
        this.addClassToHast(node, 'ap-collapsible');
      }
    },
  };
}
