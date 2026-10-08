import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { MarkdownEnv, MarkdownRenderer } from '../../../shared/types.ts';
import { localImageSize } from '../../image-size.ts';
import type { ImageDimension } from '../../image-size.ts';
import type { ImageSizeResolver } from '../link-rules.ts';
import { ENV, makeRenderer } from './helpers.ts';

/** Every src sizes to 640x480 except ones containing 'missing' (null). */
const stubSize: ImageSizeResolver = src =>
  src.includes('missing') ? null : { width: 640, height: 480 };

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer({ imageSize: stubSize });
});

describe('raw HTML img intrinsic sizes', () => {
  it('sizes a standalone html_block img', () => {
    const result = md.render('<img src="./a.png" alt="a">', ENV);
    expect(result.html).toContain(
      '<img src="./a.png" alt="a" width="640" height="480">',
    );
  });

  it('sizes an html_inline img inside a paragraph', () => {
    const result = md.render('before <img src="./a.png"> after', ENV);
    expect(result.html).toContain(
      '<img src="./a.png" width="640" height="480">',
    );
  });

  it('sizes every img of a multi-img block', () => {
    const result = md.render(
      '<div>\n<img src="./a.png">\n<img src="./b.png">\n</div>',
      ENV,
    );
    expect(result.html.match(/width="640"/g)).toHaveLength(2);
  });

  it('keeps tags with an explicit width or height untouched', () => {
    expect(md.render('<img src="./a.png" width="100">', ENV).html).toContain(
      '<img src="./a.png" width="100">',
    );
    expect(md.render('<img src="./a.png" height="100">', ENV).html).toContain(
      '<img src="./a.png" height="100">',
    );
  });

  it('leaves unsizable srcs untouched (resolver null)', () => {
    expect(md.render('<img src="./missing.png">', ENV).html).toContain(
      '<img src="./missing.png">',
    );
  });

  it('skips imgs without a src attribute', () => {
    expect(md.render('<img alt="no src">', ENV).html).toContain(
      '<img alt="no src">',
    );
  });

  it('inserts the attributes before a self-closing slash', () => {
    expect(md.render('<img src="./a.png" />', ENV).html).toContain(
      '<img src="./a.png" width="640" height="480" />',
    );
  });

  it('reads single-quoted and unquoted src attributes', () => {
    expect(md.render("<img src='./a.png'>", ENV).html).toContain(
      '<img src=\'./a.png\' width="640" height="480">',
    );
    expect(md.render('<img src=./a.png>', ENV).html).toContain(
      '<img src=./a.png width="640" height="480">',
    );
  });

  it('does not disturb a quoted attribute value containing >', () => {
    const result = md.render('<img src="./a.png" alt="a > b">', ENV);
    expect(result.html).toContain(
      '<img src="./a.png" alt="a > b" width="640" height="480">',
    );
  });

  it('caches resolved sizes per (file, src) across renders', async () => {
    const spy = vi.fn<ImageSizeResolver>(() => ({ width: 1, height: 2 }));
    const caching = await makeRenderer({ imageSize: spy });
    caching.render('<img src="./a.png">\n\n<img src="./a.png">', ENV);
    caching.render('<img src="./a.png">', ENV);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('leaves raw img tags untouched without an imageSize resolver', async () => {
    const plain = await makeRenderer();
    expect(plain.render('<img src="./a.png">', ENV).html).toContain(
      '<img src="./a.png">',
    );
  });
});

describe('raw HTML img sizes with the real file resolver', () => {
  const tmpDirs: string[] = [];
  afterAll(async () => {
    await Promise.all(
      tmpDirs.map(dir => rm(dir, { recursive: true, force: true })),
    );
  });

  /** PNG: 8-byte signature + IHDR chunk header + width/height. */
  function pngBytes(width: number, height: number): Buffer {
    const buf = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12, 'latin1');
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf;
  }

  it('reads the intrinsic size off a local file and skips externals', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ap-rawimg-'));
    tmpDirs.push(dir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'pic.png'), pngBytes(320, 200));
    const env: MarkdownEnv = { filePath: path.join(dir, 'post.md') };
    const real = await makeRenderer({ imageSize: localImageSize });

    expect(real.render('<img src="./pic.png">', env).html).toContain(
      '<img src="./pic.png" width="320" height="200">',
    );
    // Remote and public-root srcs resolve to null: untouched.
    const remote = real.render(
      '<img src="https://cdn.example.com/x.png">\n\n<img src="/logo.png">',
      env,
    );
    expect(remote.html).not.toContain('width=');
  });

  it('honors ImageDimension rounding of the resolver verbatim', async () => {
    const dim: ImageDimension = { width: 7, height: 3 };
    const fixed = await makeRenderer({ imageSize: () => dim });
    expect(fixed.render('<img src="./x.gif">', ENV).html).toContain(
      'width="7" height="3"',
    );
  });
});
