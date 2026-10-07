import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

describe('img-size (legacy `=WxH` syntax)', () => {
  it('parses width only, with a space before the marker', () => {
    const result = md.render('![a](/img/x.jpg =300x)', ENV);
    expect(result.html).toContain(
      '<img src="/assets//img/x.jpg" alt="a" width="300"',
    );
    expect(result.html).not.toContain('=300x');
  });

  it('parses width and height', () => {
    const result = md.render('![a](/img/x.jpg =300x200)', ENV);
    expect(result.html).toContain('width="300"');
    expect(result.html).toContain('height="200"');
  });
});

describe('img-size (alt-side `![alt =WxH]` syntax)', () => {
  it('parses width only, with a space before the marker', () => {
    const result = md.render('![a =300x](/img/x.jpg)', ENV);
    expect(result.html).toContain(
      '<img src="/assets//img/x.jpg" alt="a" width="300"',
    );
    expect(result.html).not.toContain('=300x');
  });

  it('parses width and height', () => {
    const result = md.render('![a =300x200](/img/x.jpg)', ENV);
    expect(result.html).toContain('width="300"');
    expect(result.html).toContain('height="200"');
  });

  it('still resolves and copies the image src', () => {
    const result = md.render('![a =300x](./local.png)', ENV);
    expect(result.html).toContain('src="/assets/local.png"');
    expect(result.html).toContain('loading="lazy"');
  });

  it('keeps a non-size marker literal in the alt text', () => {
    const result = md.render('![a =wide](/img/x.jpg)', ENV);
    expect(result.html).toContain('alt="a =wide"');
    expect(result.html).not.toContain('width=');
  });

  it('coexists with the legacy destination-side syntax', () => {
    const result = md.render(
      [
        '![a =300x](/img/alt-side.jpg)',
        '',
        '![b](/img/dest-side.jpg =200x)',
      ].join('\n'),
      ENV,
    );
    // Each solo-paragraph image upgrades to a figure (alt becomes the
    // caption); assert the resolved sizes per figure instead of attr order.
    expect(result.html).toContain('width="300"');
    expect(result.html).toContain('width="200"');
    expect(result.html).toContain('>a</figcaption>');
    expect(result.html).toContain('>b</figcaption>');
    expect(result.html).not.toContain('=300x');
    expect(result.html).not.toContain('=200x');
  });
});
