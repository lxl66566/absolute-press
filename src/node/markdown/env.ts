/**
 * Per-render context shared between markdown-it rules via `env`.
 * markdown-it types `env` loosely, so the context lives under a single key
 * and is read back through one localized cast (see `getCtx`).
 */
import type { Env } from 'markdown-it';

import type {
  CollectedLink,
  Heading,
  MarkdownEnv,
} from '../../shared/types.ts';
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
