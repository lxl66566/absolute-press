import { beforeAll, describe, expect, it } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

describe('link collection and rewriting', () => {
  it('rewrites internal .md links via resolveLink', () => {
    const result = md.render('[go](./foo.md)', ENV);
    expect(result.html).toContain('href="/resolved/foo.html"');
    expect(result.links).toEqual([
      {
        raw: './foo.md',
        resolved: '/resolved/foo.html',
        kind: 'internal',
        dead: false,
        line: 1,
      },
    ]);
  });

  it('re-appends anchors to the resolved route', () => {
    const result = md.render('[go](./foo.md#section)', ENV);
    expect(result.html).toContain('href="/resolved/foo.html#section"');
    expect(result.links[0]).toMatchObject({
      resolved: '/resolved/foo.html#section',
      kind: 'internal',
    });
  });

  it('passes scroll-text fragments through verbatim', () => {
    const result = md.render('[go](./foo.md#:~:text=hello)', ENV);
    expect(result.html).toContain('/resolved/foo.html#:~:text=hello');
    expect(result.links[0]).toMatchObject({
      resolved: '/resolved/foo.html#:~:text=hello',
      dead: false,
    });
  });

  it('marks dead links and keeps the raw href', () => {
    const result = md.render('[go](./dead.md)', ENV);
    expect(result.html).toContain('href="./dead.md"');
    expect(result.links[0]).toEqual({
      raw: './dead.md',
      resolved: './dead.md',
      kind: 'internal',
      dead: true,
      line: 1,
    });
  });

  it('classifies external links', () => {
    const result = md.render('[go](https://example.com/x)', ENV);
    expect(result.html).toContain('href="https://example.com/x"');
    expect(result.links[0]).toMatchObject({
      kind: 'external',
      resolved: 'https://example.com/x',
    });
  });

  it('classifies pure anchors', () => {
    const result = md.render('[go](#local)', ENV);
    expect(result.links[0]).toMatchObject({ kind: 'anchor', dead: false });
  });

  it('routes extensionless relative links through resolveLink', () => {
    const result = md.render('[go](./usage)', ENV);
    expect(result.html).toContain('href="/resolved/usage"');
    expect(result.links[0]).toMatchObject({ kind: 'internal', dead: false });
  });

  it('routes directory-style relative links through resolveLink', () => {
    const result = md.render('[go](./2022/#frag)', ENV);
    expect(result.links[0]).toMatchObject({ kind: 'internal', dead: false });
    expect(result.links[0]?.resolved).toContain('#frag');
  });

  it('routes .md links with a trailing slash through resolveLink', () => {
    const result = md.render('[go](../essay/2023.md/#frag)', ENV);
    expect(result.links[0]).toMatchObject({ kind: 'internal', dead: false });
  });

  it('marks unresolved extensionless links as dead', () => {
    const result = md.render('[go](./dead)', ENV);
    expect(result.html).toContain('href="./dead"');
    expect(result.links[0]).toMatchObject({ kind: 'internal', dead: true });
  });

  it('passes relative links with a non-markdown extension through', () => {
    const result = md.render('[go](../rss.xml)', ENV);
    expect(result.html).toContain('href="../rss.xml"');
    expect(result.links[0]).toMatchObject({ kind: 'external', dead: false });
  });
});

describe('source lines', () => {
  it('stamps the block start line for main-document links', () => {
    const src = 'para\n\n[one](./a.md)\n\n# Head\n\n[two](./b.md)';
    const result = md.render(src, ENV);
    expect(result.links.map(l => l.line)).toEqual([3, 7]);
  });

  it('reports the paragraph start for links in multi-line paragraphs', () => {
    const result = md.render('text\n[link](./a.md)\nmore', ENV);
    expect(result.links[0]?.line).toBe(1);
  });

  it('omits lines for links inside island inner markdown', async () => {
    const renderer = await makeRenderer({ islands: [{ name: 'Demo' }] });
    const result = renderer.render('<Demo>\n\n[go](./foo.md)\n\n</Demo>', ENV);
    expect(result.links).toHaveLength(1);
    expect(result.links[0]?.line).toBeUndefined();
  });
});

describe('image rewriting', () => {
  let renderer: MarkdownRenderer;
  beforeAll(async () => {
    renderer = await makeRenderer({ islands: [{ name: 'Demo' }] });
  });

  it('rewrites relative src via resolveImage and adds lazy loading', () => {
    const result = renderer.render('![alt](./pic.png)', ENV);
    expect(result.html).toContain('src="/assets/pic.png"');
    expect(result.html).toContain('loading="lazy"');
  });

  it('leaves absolute urls untouched', () => {
    const result = renderer.render('![alt](https://example.com/pic.png)', ENV);
    expect(result.html).toContain('src="https://example.com/pic.png"');
  });

  it('collects links inside island inner markdown', () => {
    const result = renderer.render('<Demo>\n\n[go](./foo.md)\n\n</Demo>', ENV);
    expect(result.html).toContain('href="/resolved/foo.html"');
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({ kind: 'internal', dead: false });
  });

  it('injects intrinsic dimensions for local images via imageSize', async () => {
    const sized = await makeRenderer({
      imageSize: src =>
        src === './pic.png' ? { width: 640, height: 480 } : null,
    });
    const result = sized.render('![alt](./pic.png)', ENV);
    expect(result.html).toContain('width="640"');
    expect(result.html).toContain('height="480"');
    expect(result.html).toContain('loading="lazy"');
  });

  it('leaves remote and sizeless images without dimensions', async () => {
    const sized = await makeRenderer({ imageSize: () => null });
    const result = sized.render(
      '![alt](https://example.com/pic.png)\n\n![alt](./pic.png)',
      ENV,
    );
    expect(result.html).not.toContain('width=');
    expect(result.html).not.toContain('height=');
    expect(result.html).toContain('loading="lazy"');
  });

  it('keeps explicit img-size dimensions over injected ones', async () => {
    const sized = await makeRenderer({
      imageSize: src =>
        src === './pic.png' ? { width: 640, height: 480 } : null,
    });
    const urlSide = sized.render('![alt](./pic.png =300x200)', ENV);
    expect(urlSide.html).toContain('width="300"');
    expect(urlSide.html).toContain('height="200"');
    expect(urlSide.html).not.toContain('width="640"');
    // Alt-side `=300x` sets width only: any explicit dimension suppresses
    // the injection entirely (no mixed computed/explicit pairs).
    const altSide = sized.render('![alt =300x](./pic.png)', ENV);
    expect(altSide.html).toContain('width="300"');
    expect(altSide.html).not.toContain('height="');
  });
});

describe('bare relative links (strictLinks)', () => {
  it('marks bare .md links without rewriting them', () => {
    const result = md.render('[go](guide/a.md)', ENV);
    expect(result.html).toContain('href="guide/a.md"');
    expect(result.links[0]).toEqual({
      raw: 'guide/a.md',
      resolved: 'guide/a.md',
      kind: 'external',
      dead: false,
      bare: true,
      line: 1,
    });
  });

  it('marks extension-less bare links too', () => {
    const result = md.render('[go](guide/a)', ENV);
    expect(result.links[0]).toMatchObject({
      bare: true,
      kind: 'external',
      dead: false,
    });
  });

  it('keeps site-absolute and asset links unmarked', () => {
    const result = md.render('[a](/img/x.png) [b](../rss.xml)', ENV);
    expect(result.links).toHaveLength(2);
    expect(result.links.every(link => !link.bare)).toBe(true);
  });

  it('keeps prefixed markdown links on the internal path', () => {
    const result = md.render('[go](./foo.md)', ENV);
    expect(result.links[0]).toMatchObject({ kind: 'internal', dead: false });
    expect(result.links[0]?.bare).toBeUndefined();
  });
});
