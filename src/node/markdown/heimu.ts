import type { StateInline } from 'markdown-it';

import { messagesForLang } from '../../shared/i18n/index.ts';
import { getCtx } from './env.ts';

/**
 * Heimu (black-bar spoiler): `!!text!!` -> `<span class="ap-heimu">`.
 * Pure CSS interaction on the client; inner content is parsed as inline md.
 * The default hover tooltip (lang-resolved UI copy) is baked in at build
 * time.
 */
export function heimuRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 4 > max) return false;
  if (state.src.charCodeAt(start) !== 0x21 /* ! */) return false;
  if (state.src.charCodeAt(start + 1) !== 0x21) return false;

  let end = -1;
  let pos = start + 2;
  while (pos + 2 <= max) {
    const found = state.src.indexOf('!!', pos);
    if (found === -1 || found + 2 > max) break;
    if (state.src.charCodeAt(found - 1) !== 0x5c /* \ */) {
      end = found;
      break;
    }
    pos = found + 2;
  }
  // Empty content (`!!!!`) is not a heimu span.
  if (end === -1 || end === start + 2) return false;
  if (silent) return true;

  const open = state.push('heimu_open', 'span', 1);
  open.markup = '!!';
  open.attrs = [
    ['class', 'ap-heimu'],
    ['title', messagesForLang(getCtx(state.env).env.lang).heimu.tip],
  ];

  // Paired-rule pattern: tokenize the inner slice as inline markdown.
  state.pos = start + 2;
  state.posMax = end;
  state.md.inline.tokenize(state);
  state.pos = end + 2;
  state.posMax = max;

  const close = state.push('heimu_close', 'span', -1);
  close.markup = '!!';
  return true;
}
