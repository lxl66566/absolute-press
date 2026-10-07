import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

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
