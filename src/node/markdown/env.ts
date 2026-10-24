/**
 * Per-render context shared between markdown-it rules via `env`.
 * markdown-it types `env` loosely, so the context lives under a single key
 * and is read back through one localized cast (see `getCtx`).
 */
import type { Env, MarkdownIt as MarkdownItType } from 'markdown-it';

import type {
  CollectedLink,
  Heading,
  MarkdownEnv,
} from '../../shared/types.ts';
import type { IslandExtraction } from './islands.ts';
import type { Slugger } from './slugify.ts';

/** Render-wide counters, shared with nested island fragments by reference. */
export interface AbsSeq {
  tabGroup: number;
  tabInput: number;
  fragment: number;
  /** Fold-checkbox ids of collapsed code blocks. */
  codeFold: number;
}

export interface AbsCtx {
  /** Public render env (option callbacks receive this). */
  env: MarkdownEnv;
  slugger: Slugger;
  /** First h1 plain text. */
  title: string | null;
  headings: Heading[];
  links: CollectedLink[];
  seq: AbsSeq;
  /**
   * Radio-group names of the tabs containers open in the current render
   * stream, innermost last. The close render pops so tabs after a nested
   * container keep the outer group (radio `name` is one exclusion group
   * per unique value across the whole document).
   */
  tabGroupStack: string[];
  /**
   * Island scan of the text this fragment rendered, stashed at the top of
   * `renderFragment` so the page reading-time pass reuses it instead of
   * re-running the fence state machine over the whole content. Nested
   * fragments write to their private ctx copy; only the top-level one is
   * read (render). Null for the entries that never scan islands (renderRef,
   * inline).
   */
  islandScan: IslandExtraction | null;
}

const CTX_KEY = 'apCtx';

interface EnvWithCtx extends Env {
  [CTX_KEY]?: AbsCtx;
}

export function setCtx(env: Env, ctx: AbsCtx): void {
  (env as EnvWithCtx)[CTX_KEY] = ctx;
}

export function getCtx(env: Env | undefined): AbsCtx {
  const ctx = env ? (env as EnvWithCtx)[CTX_KEY] : undefined;
  if (!ctx) throw new Error('absolute-press: markdown render context missing');
  return ctx;
}

/**
 * Env copy for `md.renderInline` of container/tab titles. renderInline runs
 * every core rule, and the footnote plugin's `footnoteTail` (after `inline`)
 * appends the whole page footnote block to the title tokens whenever
 * `env.footnotes.list` is populated. Detaching `footnotes` keeps titles clean;
 * footnote references inside a title lose their page anchor, which is
 * acceptable there. `apCtx` stays shared so renderer rules keep working
 * (tab radio ids, counters).
 */
export function inlineTitleEnv(env: Env | undefined): Env {
  return { ...env, footnotes: undefined };
}

/**
 * Titles that cannot trigger any inline rule render as one text token, and
 * a text token renders as exactly `md.utils.escapeHtml(content)` — so the
 * tokenizer, pair balancing and core rules can be skipped. The predicate is
 * deliberately over-restrictive (false rejects are fine): only ASCII letters/digits,
 * space, tab and any non-ASCII char (CJK, fullwidth punctuation, emoji)
 * pass; every ASCII char of markdown-it's inline text-rule terminator set
 * (`\n ! # $ % & * + - : < = > @ [ \ ] ^ _ ` { } ~` — the union of all
 * inline rule triggers) falls back, plus `\r` and `\0` which the core
 * normalize rule rewrites. Byte-equality with renderInline is pinned by
 * the container test suite.
 */
const PLAIN_TITLE_RE = /^[\t A-Za-z0-9\u0080-\uffff]*$/;

/** renderInline fast path for container/tab titles (see PLAIN_TITLE_RE). */
export function renderTitleInline(
  md: MarkdownItType,
  title: string,
  env: Env | undefined,
): string {
  if (PLAIN_TITLE_RE.test(title)) return md.utils.escapeHtml(title);
  return md.renderInline(title, inlineTitleEnv(env));
}
