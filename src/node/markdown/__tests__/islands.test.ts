import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer({
    islands: [{ name: 'Demo' }, { name: 'Inner' }, { name: 'ZoomedImg' }],
  });
});

describe('islands', () => {
  it('parses string and JSON props and renders inner markdown', () => {
    const src = `<Demo name="x" :num="1" :ok="true" :data='{"a":1}'>\n\ninner **bold**\n\n</Demo>`;
    const result = md.render(src, ENV);
    expect(result.html).toContain('data-ap-island="Demo"');
    expect(result.html).toContain(
      'data-props="{&quot;name&quot;:&quot;x&quot;,&quot;num&quot;:1,&quot;ok&quot;:true,&quot;data&quot;:{&quot;a&quot;:1}}"',
    );
    expect(result.html).toContain('<strong>bold</strong>');
  });

  it('normalizes kebab-case JSON prop keys to camelCase', () => {
    // Component props are camelCase; the markdown attribute spelling is not
    // (`:box-data` addressed a `boxData` prop and used to serialize as
    // "box-data", which the component never read).
    const result = md.render(`<Demo :box-data='[{"a":1}]' />`, ENV);
    expect(result.html).toContain('&quot;boxData&quot;:[{&quot;a&quot;:1}]');
    expect(result.html).not.toContain('box-data');
  });

  it('supports self-closing tags', () => {
    const result = md.render('<Demo name="x" />', ENV);
    expect(result.html).toContain('data-ap-island="Demo"');
    expect(result.html).toContain(
      'data-props="{&quot;name&quot;:&quot;x&quot;}"',
    );
  });

  it('renders nested islands recursively', () => {
    const result = md.render('<Demo>\n\n<Inner>hi</Inner>\n\n</Demo>', ENV);
    expect(result.html).toContain('data-ap-island="Demo"');
    expect(result.html).toContain('data-ap-island="Inner"');
    expect(result.html).toContain('hi');
  });

  it('leaves unregistered tags untouched', () => {
    const result = md.render('<Other name="x">body</Other>', ENV);
    expect(result.html).toContain('<Other name="x">body</Other>');
  });

  it('does not extract islands inside code spans or fences', () => {
    const fence = '```';
    const src = [
      '`<Demo name="x" />`',
      '',
      `${fence}md`,
      '<Demo name="y" />',
      fence,
    ].join('\n');
    const result = md.render(src, ENV);
    expect(result.html).not.toContain('data-ap-island');
    expect(result.html).toContain('&lt;Demo');
  });

  it('keeps the island whole when a stray close tag sits inside a fenced block', () => {
    // Docs routinely show an island's usage inside its own children; the
    // fenced `</Demo>` there must not end the island early.
    const src = [
      '<Demo>',
      '',
      '```md',
      'usage: </Demo>',
      '```',
      '',
      'real *content*',
      '</Demo>',
    ].join('\n');
    const result = md.render(src, ENV);
    expect(result.html).toContain('data-ap-island="Demo"');
    // The fenced example renders as a code block inside the island...
    expect(result.html).toContain('language-md');
    expect(result.html).toContain('usage');
    // ...and the content after it stays in the island instead of leaking out.
    expect(result.html).toContain('<em>content</em>');
    expect(result.html).not.toContain('</Demo>'); // no raw close tag leaks
  });

  it('ignores same-name open tags inside fenced blocks', () => {
    const src = [
      '<Demo>',
      '',
      '```md',
      '<Demo name="x">',
      '```',
      '',
      'after *fence*',
      '</Demo>',
    ].join('\n');
    const result = md.render(src, ENV);
    expect(result.html).toContain('data-ap-island="Demo"');
    expect(result.html).toContain('<em>fence</em>');
    expect(result.html).not.toContain('<Demo name="x">');
  });

  it('tracks same-tag nesting depth only outside fences', () => {
    const src = [
      '<Demo>',
      'outer *para*',
      '',
      '```md',
      '<Demo>',
      '  <Demo />',
      '</Demo>',
      '```',
      '',
      '~~~md',
      '</Demo>',
      '~~~',
      '',
      'tail *text*',
      '</Demo>',
    ].join('\n');
    const result = md.render(src, ENV);
    expect(result.html).toContain('data-ap-island="Demo"');
    expect(result.html).toContain('<em>para</em>');
    expect(result.html).toContain('<em>text</em>');
    expect(result.html).not.toContain('</Demo>'); // no raw close tag leaks
  });

  it('supports tilde fences and treats an unclosed fence as reaching EOF', () => {
    const tilde = [
      '<Demo>',
      '~~~md',
      '</Demo>',
      '~~~',
      'body *x*',
      '</Demo>',
    ].join('\n');
    const closed = md.render(tilde, ENV);
    expect(closed.html).toContain('data-ap-island="Demo"');
    expect(closed.html).toContain('<em>x</em>');
    expect(closed.html).not.toContain('</Demo>');

    // The only close tag lives inside a fence that never closes: it is code,
    // the island has no close at all and must not be extracted.
    const unclosed = ['<Demo>', 'body', '```md', '</Demo>'].join('\n');
    const open = md.render(unclosed, ENV);
    expect(open.html).not.toContain('data-ap-island');
  });

  it('throws on invalid JSON props', () => {
    expect(() => md.render('<Demo :num="oops" />', ENV)).toThrow(
      /invalid JSON/,
    );
  });

  it('parses long JSON props beyond the short-attribute window', () => {
    const big = Array.from({ length: 200 }, (_, i) => ({
      text: `item ${i}`,
      url: `./a/${i}`,
    }));
    const src = `<Demo :items='${JSON.stringify(big)}' />`;
    const result = md.render(src, ENV);
    expect(result.html).toContain('data-ap-island="Demo"');
    expect(result.html).toContain('&quot;url&quot;:&quot;./a/0&quot;');
    expect(result.html).toContain('item 199');
  });

  it('resolves relative ZoomedImg src through resolveImage', () => {
    const result = md.render(
      [
        '<ZoomedImg src="./pic.png" alt="rel" />',
        '<ZoomedImg src="/abs.png" alt="abs" />',
        '<ZoomedImg src="https://example.com/x.png" alt="ext" />',
      ].join('\n'),
      ENV,
    );
    expect(result.html).toContain(
      '&quot;src&quot;:&quot;/assets/pic.png&quot;',
    );
    expect(result.html).toContain('&quot;src&quot;:&quot;/abs.png&quot;');
    expect(result.html).toContain(
      '&quot;src&quot;:&quot;https://example.com/x.png&quot;',
    );
  });
});
