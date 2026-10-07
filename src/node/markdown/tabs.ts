import { container } from '@mdit/plugin-container';
import type { MarkdownIt, RendererRule, StateCore, Token } from 'markdown-it';

import { getCtx, inlineTitleEnv } from './env.ts';
import { fenceOpenOf, isFenceClose, type FenceOpen } from './fence.ts';

const VARIANTS = ['tabs', 'code-tabs'] as const;
type TabsVariant = (typeof VARIANTS)[number];

/** `@tab Title` or `@tab:active Title` marker paragraph content. */
const TAB_RE = /^@tab(:active)?(?:\s+([\s\S]*))?$/;

/** `@tab` marker at line start. */
const TAB_LINE_RE = /^@tab(?::active)?(?:\s|$)/;

/**
 * theme-hope compatibility: `@tab` markers may directly follow content
 * without a blank line. Ensure they start their own paragraph so the token
 * transform can split tabs. Fenced code blocks are left untouched (shared
 * fence state machine from fence.ts — same semantics as island extraction
 * and entry splitting, no third drifting copy).
 */
export function normalizeTabMarkers(src: string): string {
  if (!src.includes('@tab')) return src;
  const lines = src.split('\n');
  const out: string[] = [];
  let fence: FenceOpen | null = null;
  for (const line of lines) {
    if (fence === null) {
      fence = fenceOpenOf(line);
    } else if (isFenceClose(line, fence)) {
      fence = null;
    }
    // Fence lines themselves cannot be tab markers (marker-only syntax).
    if (fence === null && TAB_LINE_RE.test(line)) {
      const prev = out[out.length - 1];
      if (prev !== undefined && prev.trim() !== '') out.push('');
      // The marker must be its own paragraph: also detach following content.
      out.push(line, '');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

interface TabMeta {
  title: string;
  checked: boolean;
}

/**
 * tabs/code-tabs containers (CSS-only radio pattern, no JS required):
 * the outer `:::` container is parsed by @mdit/plugin-container, then a core
 * rule splits the inner tokens at `@tab` markers into tab_open/tab_close
 * pairs. `::: tabs#id` persists the selection via `data-persist`.
 * Nested tabs (outer container written with a longer marker run, `::::`)
 * keep separate radio groups via a name stack: open pushes, close pops.
 */
export function registerTabs(md: MarkdownIt): void {
  for (const variant of VARIANTS) {
    const pattern = new RegExp(`^${variant}(?=#|\\s|$)`);
    md.use(container, {
      name: variant,
      validate: params => pattern.test(params.trim()),
      openRenderer: tabsContainerOpen(md, variant),
      closeRenderer: tabsContainerClose,
    });
  }
  md.core.ruler.after('inline', 'ap-tabs', tabsTransform);

  md.renderer.rules['tab_open'] = (tokens, idx, _options, env) => {
    const token = tokens[idx];
    if (!token) return '';
    const ctx = getCtx(env);
    const meta = tabMeta(token);
    ctx.seq.tabInput += 1;
    const inputId = `ap-tab-${ctx.seq.tabInput}`;
    const titleHtml = md.renderInline(meta.title, inlineTitleEnv(env));
    const checked = meta.checked ? ' checked' : '';
    const group = ctx.tabGroupStack.at(-1);
    if (!group) {
      // Unreachable: every tab_open sits inside a tabs container whose
      // openRenderer pushed a group earlier in the same render pass.
      throw new Error(
        'absolute-press: tabs radio group stack empty at tab_open',
      );
    }
    return (
      `<input class="ap-tabs__radio" type="radio" id="${inputId}" name="${group}"${checked}>\n` +
      `<label class="ap-tabs__label" for="${inputId}">${titleHtml}</label>\n` +
      `<div class="ap-tab" data-title="${md.utils.escapeHtml(meta.title)}">\n`
    );
  };
  md.renderer.rules['tab_close'] = () => '</div>\n';
}

function tabsContainerOpen(md: MarkdownIt, variant: TabsVariant): RendererRule {
  return (tokens, idx, _options, env) => {
    const token = tokens[idx];
    if (!token) return '';
    const ctx = getCtx(env);
    const persist = persistId(token.info);
    ctx.seq.tabGroup += 1;
    // Radio names must be unique per instance: same-document radios sharing a
    // name form ONE browser exclusion group, so N groups with the same persist
    // id kept only the last built-in `checked` alive and hid every other
    // panel. Cross-instance sync for shared persist ids happens client-side
    // instead (initTabsPersistence in runtime/entry.tsx).
    const instance = persist ?? `${variant}-${ctx.seq.tabGroup}`;
    ctx.tabGroupStack.push(`ap-tabs-${instance}-${ctx.seq.tabGroup}`);
    const persistAttr = persist
      ? ` data-persist="${md.utils.escapeHtml(persist)}"`
      : '';
    const cls = variant === 'code-tabs' ? 'ap-tabs ap-tabs--code' : 'ap-tabs';
    return `<div class="${cls}"${persistAttr}>\n`;
  };
}

const tabsContainerClose: RendererRule = (tokens, idx, _options, env) => {
  const token = tokens[idx];
  if (!token) return '';
  // Restore the enclosing group: without the pop, tabs after a nested
  // container would join the inner radio group and clicking the inner
  // tabs would uncheck the outer tab and hide its panel.
  getCtx(env).tabGroupStack.pop();
  return '</div>\n';
};

/** Persist id after `#`: any run without whitespace or `#` (CJK allowed). */
function persistId(info: string): string | null {
  const match = /#([^\s#]+)/.exec(info);
  return match?.[1] ?? null;
}

function tabMeta(token: Token): TabMeta {
  const meta = token.meta;
  const title = meta?.['title'];
  return {
    title: typeof title === 'string' ? title : '',
    checked: meta?.['checked'] === true,
  };
}

function isTabsOpen(type: string): boolean {
  return type === 'container_tabs_open' || type === 'container_code-tabs_open';
}

/** Find the close token matching an open token (same type and level). */
function findClose(tokens: Token[], openIdx: number, open: Token): number {
  const closeType = open.type.replace('_open', '_close');
  for (let j = openIdx + 1; j < tokens.length; j++) {
    const token = tokens[j];
    if (token && token.type === closeType && token.level === open.level)
      return j;
  }
  return -1;
}

/** Split tabs container content at `@tab` marker paragraphs. */
function tabsTransform(state: StateCore): boolean {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (!open || !isTabsOpen(open.type)) continue;
    const closeIdx = findClose(tokens, i, open);
    if (closeIdx === -1) continue;

    const base = open.level + 1;
    const segments: { title: string; active: boolean; tokens: Token[] }[] = [];
    const preamble: Token[] = [];
    const inner = tokens.slice(i + 1, closeIdx);
    for (let k = 0; k < inner.length; k++) {
      const token = inner[k];
      if (!token) continue;
      if (token.type === 'paragraph_open' && token.level === base) {
        const inline = inner[k + 1];
        const paragraphClose = inner[k + 2];
        const match =
          inline?.type === 'inline' ? TAB_RE.exec(inline.content.trim()) : null;
        if (match && paragraphClose?.type === 'paragraph_close') {
          segments.push({
            title: match[2]?.trim() || `Tab ${segments.length + 1}`,
            active: match[1] === ':active',
            tokens: [],
          });
          k += 2;
          continue;
        }
      }
      const current = segments[segments.length - 1];
      if (current) current.tokens.push(token);
      else preamble.push(token);
    }
    // No `@tab` markers: leave the container content untouched.
    if (segments.length === 0) continue;

    const activeIdx = segments.findIndex(seg => seg.active);
    const replacement: Token[] = [];
    segments.forEach((seg, index) => {
      const tabOpen = new state.Token('tab_open', 'div', 1);
      tabOpen.block = true;
      tabOpen.level = base;
      tabOpen.meta = {
        title: seg.title,
        checked: activeIdx === -1 ? index === 0 : index === activeIdx,
      } satisfies TabMeta;
      const tabClose = new state.Token('tab_close', 'div', -1);
      tabClose.block = true;
      tabClose.level = base;
      replacement.push(tabOpen, ...seg.tokens, tabClose);
    });
    // Keep scanning after the splice: nested tabs containers inside tab
    // content must still be transformed when the loop reaches them.
    tokens.splice(i + 1, closeIdx - i - 1, ...preamble, ...replacement);
  }
  return true;
}
