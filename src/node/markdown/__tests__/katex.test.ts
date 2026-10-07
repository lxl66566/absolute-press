import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

describe('katex', () => {
  it('renders inline math', () => {
    const result = md.render('能量 $E = mc^2$ 公式', ENV);
    expect(result.html).toContain('class="katex"');
    expect(result.html).not.toContain('katex-display');
  });

  it('renders block math', () => {
    const result = md.render('$$x^2 + y^2 = z^2$$', ENV);
    expect(result.html).toContain('katex-display');
  });
});
