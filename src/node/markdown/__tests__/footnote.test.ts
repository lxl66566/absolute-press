import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

/**
 * Inner markup of a container title element. Titles carry a leading type
 * icon (svg) since M8, so the old exact-string match became
 * `icon + label`; the leak guard needs the full inner markup anyway.
 */
function titleInner(html: string, tag: 'p' | 'summary'): string {
  const pattern = new RegExp(
    `<${tag} class="ap-container__title">([\\s\\S]*?)</${tag}>`,
  );
  return pattern.exec(html)?.[1] ?? '';
}

describe('footnote', () => {
  it('supports Unicode labels', () => {
    const result = md.render('参考[^胆结石]一下\n\n[^胆结石]: 一种疾病', ENV);
    expect(result.html).toContain('footnote-ref');
    expect(result.html).toContain('一种疾病');
    expect(result.html).toContain('footnotes');
  });
});

describe('footnotes do not leak into inline-rendered titles', () => {
  // Regression: renderInline of container/tab titles runs every core rule,
  // so the footnote plugin appended the page footnote block (with illegal
  // <hr>/<section> nesting inside the title element) to every title.
  const page = [
    '正文引用[^1]。',
    '',
    '[^1]: 脚注内容说明',
    '',
    '::: tip 自定义标题',
    '容器内容',
    ':::',
  ].join('\n');

  it('keeps the container title element clean', () => {
    const result = md.render(page, ENV);
    // Full inner match on the title element: a leaked footnote block would
    // append <hr>/<section> inside this <p> (after the leading type icon).
    const inner = titleInner(result.html, 'p');
    expect(inner.endsWith('自定义标题')).toBe(true);
    expect(inner).not.toContain('footnote');
    expect(inner).not.toContain('<hr');
    expect(inner).not.toContain('<section');
  });

  it('renders exactly one footnote block per page', () => {
    const result = md.render(page, ENV);
    expect(result.html.match(/class="footnotes-sep"/g)).toHaveLength(1);
    expect(result.html).toContain('脚注内容说明');
  });

  it('keeps <summary> free of illegal nesting', () => {
    const result = md.render(
      '引用[^a]\n\n[^a]: note\n\n::: details 摘要\nhidden\n:::',
      ENV,
    );
    const summary = titleInner(result.html, 'summary');
    expect(summary.endsWith('摘要')).toBe(true);
    expect(summary).not.toContain('footnote');
    expect(summary).not.toContain('<hr');
    expect(result.html.match(/class="footnotes-sep"/g)).toHaveLength(1);
  });

  it('keeps tab labels clean', () => {
    const result = md.render(
      '引用[^b]\n\n[^b]: note\n\n::: tabs\n@tab 标签甲\n甲\n@tab 标签乙\n乙\n:::',
      ENV,
    );
    expect(result.html).toContain('>标签甲</label>');
    expect(result.html).toContain('>标签乙</label>');
    expect(result.html.match(/class="footnotes-sep"/g)).toHaveLength(1);
  });

  it('keeps island fragment footnotes isolated from page titles', async () => {
    const withIsland = await makeRenderer({
      islands: [{ name: 'Mermaid' }],
    });
    const result = withIsland.render(
      [
        '页面引用[^p]。',
        '',
        '[^p]: 页面脚注',
        '',
        '::: tip 标题',
        '<Mermaid>',
        '',
        '片段引用[^f]',
        '',
        '[^f]: 片段脚注',
        '',
        '</Mermaid>',
        ':::',
      ].join('\n'),
      ENV,
    );
    const inner = titleInner(result.html, 'p');
    expect(inner.endsWith('标题')).toBe(true);
    expect(inner).not.toContain('footnote');
    // Page + fragment footnotes: one block each, never inside a title.
    expect(result.html.match(/class="footnotes-sep"/g)).toHaveLength(2);
  });
});
