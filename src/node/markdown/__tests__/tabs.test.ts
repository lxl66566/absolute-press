import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

/** Map tab title -> radio group name from the rendered input/label pairs. */
function groupByTitle(html: string): Map<string, string> {
  return new Map(
    [
      ...html.matchAll(
        /name="([^"]+)"[^>]*>\n<label class="ap-tabs__label"[^>]*>([^<]*)<\/label>/g,
      ),
    ].map(m => [m[2] ?? '', m[1] ?? '']),
  );
}

describe('tabs container', () => {
  const src = [
    '::: tabs#fruit',
    '@tab Apple',
    'apple content',
    '@tab:active Banana',
    'banana content',
    ':::',
  ].join('\n');

  it('renders the CSS-only radio structure', () => {
    const result = md.render(src, ENV);
    expect(result.html).toContain('<div class="ap-tabs" data-persist="fruit">');
    expect(result.html.match(/class="ap-tabs__radio"/g)).toHaveLength(2);
    // Radio names are unique per instance (instance seq suffix); same-document
    // groups sharing a name would collapse into one browser exclusion group.
    expect(result.html).toContain('name="ap-tabs-fruit-1"');
    expect(result.html).toContain('<label class="ap-tabs__label"');
    expect(result.html).toContain('<div class="ap-tab" data-title="Apple">');
    expect(result.html).toContain('<div class="ap-tab" data-title="Banana">');
    expect(result.html).toContain('<p>apple content</p>');
    expect(result.html).toContain('<p>banana content</p>');
  });

  it('checks the :active tab', () => {
    const result = md.render(src, ENV);
    const banana = result.html.indexOf('data-title="Banana"');
    const checked = result.html.indexOf('checked');
    expect(checked).toBeGreaterThan(-1);
    // The checked radio directly precedes the Banana label and tab.
    expect(checked).toBeLessThan(banana);
    const apple = result.html.indexOf('data-title="Apple"');
    expect(checked).toBeGreaterThan(apple);
  });

  it('falls back to checking the first tab without :active', () => {
    const result = md.render('::: tabs\n@tab A\na\n@tab B\nb\n:::', ENV);
    const firstTab = result.html.indexOf('data-title="A"');
    const checked = result.html.indexOf('checked');
    expect(checked).toBeGreaterThan(-1);
    expect(checked).toBeLessThan(firstTab);
  });

  it('omits data-persist without an id', () => {
    const result = md.render('::: tabs\n@tab A\na\n:::', ENV);
    expect(result.html).toContain('<div class="ap-tabs">');
    expect(result.html).not.toContain('data-persist');
  });

  it('supports non-ASCII persist ids', () => {
    // Persist ids are free-form anchors, not HTML ids: allow CJK and any
    // run without whitespace or `#` (the value goes through escapeHtml).
    const result = md.render(
      '::: tabs#配置标签\n@tab 甲\na\n@tab 乙\nb\n:::',
      ENV,
    );
    expect(result.html).toContain(
      '<div class="ap-tabs" data-persist="配置标签">',
    );
    expect(result.html).toContain('name="ap-tabs-配置标签-1"');
  });

  it('gives same-persist groups on one page unique radio names', () => {
    // Regression: N groups with one persist id used to share `ap-tabs-<id>`,
    // forming a single radio exclusion group that left only the last group's
    // default tab checked and hid every other panel.
    const result = md.render(`${src}\n\n${src}`, ENV);
    const names = [...result.html.matchAll(/name="(ap-tabs-fruit-\d+)"/g)].map(
      m => m[1],
    );
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(2);
  });

  it('renders code-tabs with fenced blocks per tab', () => {
    const fence = '```';
    const codeTabs = [
      '::: code-tabs',
      '@tab a.ts',
      `${fence}ts`,
      'const a = 1',
      fence,
      '@tab b.js',
      `${fence}js`,
      'const b = 1',
      fence,
      ':::',
    ].join('\n');
    const result = md.render(codeTabs, ENV);
    expect(result.html).toContain('ap-tabs ap-tabs--code');
    expect(result.html).toContain('data-title="a.ts"');
    expect(result.html).toContain('data-title="b.js"');
    expect(result.html).toContain('language-ts');
    expect(result.html).toContain('language-js');
  });

  it('keeps input/label/panel adjacency for every tab in compact form', () => {
    // Compact docs-style source (markers glued to content lines). The
    // CSS-only radio pattern in theme.css relies on each label being the
    // input's next sibling and each panel the label's next sibling; a
    // broken multi-tab split would strand later labels inside the body.
    const compact = [
      '::: tabs',
      '@tab One',
      'one content',
      '@tab Two',
      'two content',
      '@tab Three',
      'three content',
      ':::',
    ].join('\n');
    const result = md.render(compact, ENV);
    const triples = result.html.match(
      /<input class="ap-tabs__radio"[^>]*>\n<label class="ap-tabs__label"[^>]*>[^<]*<\/label>\n<div class="ap-tab" data-title="[^"]*">/g,
    );
    expect(triples).toHaveLength(3);
    // Each title owns exactly its own content paragraph, in order.
    const one = result.html.indexOf('data-title="One"');
    const two = result.html.indexOf('data-title="Two"');
    const three = result.html.indexOf('data-title="Three"');
    expect(one).toBeLessThan(two);
    expect(two).toBeLessThan(three);
    expect(result.html).toContain('<p>one content</p>');
    expect(result.html).toContain('<p>two content</p>');
    expect(result.html).toContain('<p>three content</p>');
  });

  // Nested tabs: the outer container needs a longer marker run (`::::`)
  // because the container parser closes at the first marker-only line.
  const nestedSrc = [
    ':::: tabs',
    '@tab Outer A',
    'outer a content',
    '::: tabs',
    '@tab Inner 1',
    'inner 1 content',
    '@tab Inner 2',
    'inner 2 content',
    ':::',
    '@tab Outer B',
    'outer b content',
    '::::',
  ].join('\n');

  it('renders nested tabs as separate ap-tabs groups', () => {
    const html = md.render(nestedSrc, ENV).html;
    // Two group divs, four tab panels; DOM class contract unchanged.
    expect(html.match(/<div class="ap-tabs">/g)).toHaveLength(2);
    expect(html.match(/class="ap-tab" /g)).toHaveLength(4);
    // Inner tabs live inside the Outer A panel, Outer B comes after.
    const inner = html.indexOf('data-title="Inner 1"');
    const outerB = html.indexOf('data-title="Outer B"');
    expect(inner).toBeGreaterThan(html.indexOf('data-title="Outer A"'));
    expect(inner).toBeLessThan(outerB);
    expect(html).toContain('<p>inner 1 content</p>');
    expect(html).toContain('<p>outer b content</p>');
  });

  it('keeps outer radio names unpolluted by a nested tabs group', () => {
    // Regression: the container close render used to leave the inner group
    // name active, so Outer B joined the inner radio group; radio `name`
    // is one browser exclusion group per value, so clicking Inner 2
    // unchecked Outer A and hid its panel.
    const html = md.render(nestedSrc, ENV).html;
    const groups = groupByTitle(html);
    expect(groups.get('Outer A')).toBe(groups.get('Outer B'));
    expect(groups.get('Inner 1')).toBe(groups.get('Inner 2'));
    expect(groups.get('Outer A')).not.toBe(groups.get('Inner 1'));
    expect(groups.get('Outer A')).toMatch(/^ap-tabs-tabs-\d+-\d+$/);
  });

  it('keeps radio groups correct for three-level nesting', () => {
    const html = md.render(
      [
        '::::: tabs',
        '@tab L1 A',
        ':::: tabs',
        '@tab L2 A',
        '::: tabs',
        '@tab L3 A',
        'l3 a content',
        '@tab L3 B',
        'l3 b content',
        ':::',
        '@tab L2 B',
        'l2 b content',
        '::::',
        '@tab L1 B',
        'l1 b content',
        ':::::',
      ].join('\n'),
      ENV,
    ).html;
    expect(html.match(/<div class="ap-tabs">/g)).toHaveLength(3);
    expect(html.match(/class="ap-tab" /g)).toHaveLength(6);
    const groups = groupByTitle(html);
    expect(groups.get('L1 A')).toBe(groups.get('L1 B'));
    expect(groups.get('L2 A')).toBe(groups.get('L2 B'));
    expect(groups.get('L3 A')).toBe(groups.get('L3 B'));
    const levels = ['L1 A', 'L2 A', 'L3 A'].map(t => groups.get(t));
    expect(new Set(levels).size).toBe(3);
    expect(html).toContain('<p>l3 b content</p>');
    expect(html).toContain('<p>l1 b content</p>');
  });
});
