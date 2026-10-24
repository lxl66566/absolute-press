import MarkdownIt from 'markdown-it';
import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { inlineTitleEnv, renderTitleInline } from '../env.ts';
import { ENV, makeCtxEnv, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

/** Bare instance sharing the markdown-it core the renderer embeds. */
const ref = new MarkdownIt({ html: true });

/** Icon svg prefix emitted before every default/custom container title. */
const ICON_PREFIX = '<svg class="ap-container__icon"';

/** Inner markup of a container title element (`p` titles, `summary` details). */
function titleInner(html: string, tag: 'p' | 'summary' = 'p'): string {
  const pattern = new RegExp(
    `<${tag} class="ap-container__title">([\\s\\S]*?)</${tag}>`,
  );
  return pattern.exec(html)?.[1] ?? '';
}

describe('::: containers', () => {
  it('renders a tip with the default Chinese title and icon', () => {
    const result = md.render('::: tip\ncontent\n:::', ENV);
    expect(result.html).toContain(
      '<div class="ap-container ap-container--tip">',
    );
    const inner = titleInner(result.html);
    expect(inner).toContain(ICON_PREFIX);
    expect(inner.endsWith('提示')).toBe(true);
    expect(result.html).toContain('<p>content</p>');
  });

  it('renders a custom title as inline markdown after the icon', () => {
    const result = md.render('::: warning 注意 **一下**\ncontent\n:::', ENV);
    const inner = titleInner(result.html);
    expect(inner).toContain(ICON_PREFIX);
    expect(inner.endsWith('注意 <strong>一下</strong>')).toBe(true);
  });

  it('supports nesting with four-colon markers', () => {
    const src = ':::: warning\nouter\n::: tip\ninner\n:::\n::::';
    const result = md.render(src, ENV);
    const warning = result.html.indexOf('ap-container--warning');
    const tip = result.html.indexOf('ap-container--tip');
    expect(warning).toBeGreaterThanOrEqual(0);
    expect(tip).toBeGreaterThan(warning);
    expect(result.html).toContain('<p>outer</p>');
    expect(result.html).toContain('<p>inner</p>');
  });

  it('renders details as a <details> element with icon and chevron', () => {
    const result = md.render('::: details 摘要\nhidden\n:::', ENV);
    expect(result.html).toContain(
      '<details class="ap-container ap-container--details">',
    );
    const inner = titleInner(result.html, 'summary');
    expect(inner).toContain(ICON_PREFIX);
    expect(inner.endsWith('摘要')).toBe(true);
  });

  it('renders the right alignment container', () => {
    const result = md.render('::: right\naligned\n:::', ENV);
    expect(result.html).toContain(
      '<div class="ap-container ap-container--right">',
    );
    expect(result.html).toContain('<p>aligned</p>');
  });

  it('supports all titled types', () => {
    for (const type of ['danger', 'caution', 'error', 'info'] as const) {
      const result = md.render(`::: ${type}\nx\n:::`, ENV);
      expect(result.html).toContain(`ap-container--${type}`);
    }
  });
});

describe('container title overrides', () => {
  it('uses containerTitles for default titles', async () => {
    const localized = await makeRenderer({ containerTitles: { tip: 'Tip' } });
    const result = localized.render('::: tip\ncontent\n:::', ENV);
    expect(titleInner(result.html).endsWith('Tip')).toBe(true);
  });

  it('custom titles win over containerTitles', async () => {
    const localized = await makeRenderer({ containerTitles: { tip: '提示' } });
    const result = localized.render('::: tip custom\ncontent\n:::', ENV);
    expect(titleInner(result.html).endsWith('custom')).toBe(true);
  });
});

describe('container title inline fast path', () => {
  const ctxEnv = makeCtxEnv();

  it('plain titles match renderInline byte for byte', () => {
    // Mixed corpus: plain inputs take the escapeHtml fast path, while
    // 'Details 2: 续' holds a text-rule terminator (`:`) and falls back to
    // renderInline — byte equivalence is the safety contract of
    // PLAIN_TITLE_RE (env.ts) on both paths. A bare MarkdownIt shares the
    // core text rule the fast-path argument rests on; the production
    // wiring is pinned by the exact-title asserts in this file and
    // tabs.test.ts.
    const titles = [
      '提示',
      'Details 2: 续',
      '从零开始的类型系统 🎉',
      '２０２４年总结',
      'Windows Linux macOS',
      '',
    ];
    for (const title of titles) {
      expect(renderTitleInline(ref, title, ctxEnv)).toBe(
        ref.renderInline(title, inlineTitleEnv(ctxEnv)),
      );
    }
  });

  it('titles with markdown trigger chars fall back to renderInline', () => {
    const titles = [
      '注意 **一下**',
      'a `code` b',
      'snake_case',
      '==mark==',
      '[x] task',
      '<em>html</em>',
      '!!heimu!!',
      '$a+b$',
      'line1\nline2',
      'a & b',
    ];
    for (const title of titles) {
      expect(renderTitleInline(ref, title, ctxEnv)).toBe(
        ref.renderInline(title, inlineTitleEnv(ctxEnv)),
      );
    }
    expect(renderTitleInline(ref, '注意 **一下**', ctxEnv)).toContain(
      '<strong>一下</strong>',
    );
  });

  it('renders plain titles through the fast path end to end', () => {
    const result = md.render('::: tip Windows Linux macOS\nx\n:::', ENV);
    expect(titleInner(result.html).endsWith('Windows Linux macOS')).toBe(true);
  });
});
