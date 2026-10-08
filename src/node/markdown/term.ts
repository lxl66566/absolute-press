import type { StateInline } from 'markdown-it';

import type { TermHooks } from '../../shared/types.ts';
import { getCtx } from './env.ts';

/**
 * Term reference inline syntax: `[[id]]` / `[[id|display text]]` renders a
 * dotted-underline span (`<span class="ap-term" data-term="id">`) that the
 * client pairs with the build-time `<template data-ap-term>` popover of the
 * referenced article. Only registered when the site configures a refs
 * directory (the renderer receives TermHooks); otherwise the brackets stay
 * literal. Like heimu this is a paired inline rule; the explicit display
 * text is tokenized as inline markdown, the implicit one (`[[id]]`) is the
 * resolved ref title as plain text.
 */
export function termRule(hooks: TermHooks) {
  return (state: StateInline, silent: boolean): boolean => {
    const start = state.pos;
    const max = state.posMax;
    if (start + 4 > max) return false;
    if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false;
    if (state.src.charCodeAt(start + 1) !== 0x5b) return false;

    let end = -1;
    let pos = start + 2;
    while (pos + 2 <= max) {
      const found = state.src.indexOf(']]', pos);
      if (found === -1 || found + 2 > max) break;
      if (state.src.charCodeAt(found - 1) !== 0x5c /* \ */) {
        end = found;
        break;
      }
      pos = found + 2;
    }
    if (end === -1 || end === start + 2) return false; // unclosed / empty

    const inner = state.src.slice(start + 2, end);
    const bar = inner.indexOf('|');
    const id = (bar === -1 ? inner : inner.slice(0, bar)).trim();
    // Ids travel into a data attribute and a CSS selector; no whitespace and
    // no markup-sensitive characters. A bad id is literal text, not an error.
    if (id === '' || /[\s"'<>&]/.test(id)) return false;
    if (silent) return true;

    const env = getCtx(state.env).env;

    if (bar !== -1) {
      // Explicit display text: inline markdown, degraded (no span) when the
      // id resolves to nothing — the text stays readable in plain prose.
      // Tokenize only the text after `id|` (inner-relative offset).
      const known = hooks.titleOf(id, env) !== null;
      if (!known) hooks.onMiss(id, env);
      if (known) pushOpen(state, id);
      state.pos = start + 2 + bar + 1;
      state.posMax = end;
      state.md.inline.tokenize(state);
      state.pos = end + 2;
      state.posMax = max;
      if (known) pushClose(state);
      return true;
    }

    const title = hooks.titleOf(id, env);
    if (title === null) {
      hooks.onMiss(id, env);
      // Degrade: render the id itself as plain text (the author wrote the
      // brackets around a name they meant to show).
      state.push('text', '', 0).content = id;
      state.pos = end + 2;
      return true;
    }
    pushOpen(state, id);
    state.push('text', '', 0).content = title;
    pushClose(state);
    state.pos = end + 2;
    return true;
  };
}

function pushOpen(state: StateInline, id: string): void {
  const open = state.push('ap_term_open', 'span', 1);
  open.markup = '[[';
  open.attrs = [
    ['class', 'ap-term'],
    ['data-term', id],
    ['tabindex', '0'],
  ];
}

function pushClose(state: StateInline): void {
  const close = state.push('ap_term_close', 'span', -1);
  close.markup = ']]';
}
