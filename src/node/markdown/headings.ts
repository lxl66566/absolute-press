import type { StateCore, Token } from 'markdown-it';

import { getCtx } from './env.ts';

/**
 * Collect headings, assign VuePress-identical ids (ported mdit-vue slugify),
 * and pick the first h1 as the page title. The h1 itself stays in the HTML.
 */
export function headingRule(state: StateCore): boolean {
  const ctx = getCtx(state.env);
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (!open || open.type !== 'heading_open') continue;
    const inline = tokens[i + 1];
    if (!inline || inline.type !== 'inline') continue;
    // Slug input matches markdown-it-anchor: text + code_inline only, line
    // breaks dropped without a space. Display text keeps the long-standing
    // behavior of mapping breaks to spaces (matches the rendered heading).
    const slug = ctx.slugger.slug(anchorText(inline));
    const text = displayText(inline);
    const level = Number(open.tag.slice(1));
    open.attrSet('id', slug);
    ctx.headings.push({ level, text, slug });
    if (level === 1 && ctx.title === null) ctx.title = text;
  }
  return true;
}

/** Slug input: `text` + `code_inline` content only (markdown-it-anchor parity). */
export function anchorText(token: Token): string {
  let out = '';
  for (const child of token.children ?? []) {
    if (child.type === 'text' || child.type === 'code_inline')
      out += child.content;
  }
  return out;
}

/** Plain display text of an inline token (no HTML); line breaks become spaces. */
function displayText(token: Token): string {
  let out = '';
  for (const child of token.children ?? []) {
    if (child.type === 'text' || child.type === 'code_inline')
      out += child.content;
    else if (child.type === 'softbreak' || child.type === 'hardbreak')
      out += ' ';
  }
  return out;
}
