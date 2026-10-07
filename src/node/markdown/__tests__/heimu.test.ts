import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

describe('heimu', () => {
  it('renders !!text!! as a black-bar span with the default tooltip', () => {
    const result = md.render('this is !!secret!! text', ENV);
    expect(result.html).toContain(
      '<span class="ap-heimu" title="你知道的太多了">secret</span>',
    );
  });

  it('bakes the tooltip copy of the page lang', () => {
    const result = md.render('!!secret!!', { ...ENV, lang: 'en' });
    expect(result.html).toContain(
      '<span class="ap-heimu" title="You know too much">',
    );
  });

  it('parses inline markdown inside', () => {
    const result = md.render('!!**bold** and `code`!!', ENV);
    expect(result.html).toContain('<strong>bold</strong>');
    expect(result.html).toContain('<code>code</code>');
  });

  it('does not touch empty or single-marker sequences', () => {
    const result = md.render('!!!! and ! single', ENV);
    expect(result.html).not.toContain('ap-heimu');
  });
});
