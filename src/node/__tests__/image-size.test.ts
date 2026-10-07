import fs from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import type { MarkdownEnv } from '../../shared/types.ts';
import {
  imageSizeOf,
  localImageSize,
  type ImageDimension,
} from '../image-size.ts';

// -- Minimal byte-stream fixtures --------------------------------------------

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

function gifBytes(signature: string, width: number, height: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.write(signature, 0, 'latin1');
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

function jpegBytes(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([
      0xff,
      0xe0,
      0x00,
      0x10, // APP0 (JFIF), segment length 16
      0x4a,
      0x46,
      0x49,
      0x46,
      0x00,
      0x01,
      0x02,
      0x00,
      0x00,
      0x01,
      0x00,
      0x01,
      0x00,
      0x00,
    ]),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]), // SOF0, precision 8
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt16BE(height, 0);
      b.writeUInt16BE(width, 2);
      return b;
    })(),
    Buffer.from([0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
}

function riffChunk(buf: Buffer, fourcc: string): void {
  buf.write('RIFF', 0, 'latin1');
  buf.write('WEBP', 8, 'latin1');
  buf.write(fourcc, 12, 'latin1');
}

function webpLossyBytes(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  riffChunk(buf, 'VP8 ');
  buf.writeUInt32LE(10, 16);
  buf[23] = 0x9d; // frame sync 0x9d 0x01 0x2a after the 3-byte frame tag
  buf[24] = 0x01;
  buf[25] = 0x2a;
  buf.writeUInt16LE(width, 26);
  buf.writeUInt16LE(height, 28);
  return buf;
}

/** Packs the two 14-bit size-1 values LSB-first behind the 0x2f signature. */
function webpLosslessBytes(width: number, height: number): Buffer {
  const buf = Buffer.alloc(25);
  riffChunk(buf, 'VP8L');
  buf.writeUInt32LE(5, 16);
  buf[20] = 0x2f;
  const wm1 = width - 1;
  const hm1 = height - 1;
  buf[21] = wm1 & 0xff;
  buf[22] = ((wm1 >> 8) & 0x3f) | ((hm1 & 0x3) << 6);
  buf[23] = (hm1 >> 2) & 0xff;
  buf[24] = (hm1 >> 10) & 0x0f;
  return buf;
}

function webpExtendedBytes(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  riffChunk(buf, 'VP8X');
  buf.writeUInt32LE(10, 16);
  buf.writeUIntLE(width - 1, 24, 3); // flags + reserved occupy 20..23
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

function svgBytes(body: string): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${body}></svg>`);
}

function dim(width: number, height: number): ImageDimension {
  return { width, height };
}

// -- imageSizeOf --------------------------------------------------------------

describe('imageSizeOf', () => {
  it('parses PNG IHDR dimensions', () => {
    expect(imageSizeOf(pngBytes(3, 2))).toEqual(dim(3, 2));
    expect(imageSizeOf(pngBytes(1920, 1080))).toEqual(dim(1920, 1080));
  });

  it('rejects truncated PNG buffers', () => {
    expect(imageSizeOf(pngBytes(3, 2).subarray(0, 20))).toBeNull();
  });

  it('parses GIF87a and GIF89a logical screen sizes', () => {
    expect(imageSizeOf(gifBytes('GIF87a', 320, 200))).toEqual(dim(320, 200));
    expect(imageSizeOf(gifBytes('GIF89a', 1, 1))).toEqual(dim(1, 1));
  });

  it('parses JPEG SOF dimensions behind other segments', () => {
    expect(imageSizeOf(jpegBytes(640, 480))).toEqual(dim(640, 480));
    expect(imageSizeOf(jpegBytes(1, 3000))).toEqual(dim(1, 3000));
  });

  it('rejects a JPEG whose scan derails', () => {
    const buf = jpegBytes(640, 480);
    buf[20] = 0x00; // corrupt the FF marker byte in front of SOF0
    expect(imageSizeOf(buf)).toBeNull();
  });

  it('parses lossy, lossless and extended WebP', () => {
    expect(imageSizeOf(webpLossyBytes(800, 600))).toEqual(dim(800, 600));
    expect(imageSizeOf(webpLosslessBytes(300, 200))).toEqual(dim(300, 200));
    expect(imageSizeOf(webpExtendedBytes(1000, 1))).toEqual(dim(1000, 1));
  });

  it('rejects a WebP chunk it does not know', () => {
    const buf = Buffer.alloc(30);
    riffChunk(buf, 'PROB');
    expect(imageSizeOf(buf)).toBeNull();
  });

  it('reads SVG width/height attributes with optional px units', () => {
    expect(imageSizeOf(svgBytes('width="100" height="50"'))).toEqual(
      dim(100, 50),
    );
    expect(imageSizeOf(svgBytes("width='100px' height='50px'"))).toEqual(
      dim(100, 50),
    );
    // Fractional values round to integral attributes.
    expect(imageSizeOf(svgBytes('width="10.4" height="10.6"'))).toEqual(
      dim(10, 11),
    );
  });

  it('falls back to the viewBox when SVG sizes are missing', () => {
    expect(imageSizeOf(svgBytes('viewBox="0 0 200 100"'))).toEqual(
      dim(200, 100),
    );
    // XML prologs and attributes before the size ones must not matter.
    const buf = Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox=" 0 , 0 30 20 ">\n</svg>`,
    );
    expect(imageSizeOf(buf)).toEqual(dim(30, 20));
  });

  it('completes a partial SVG size pair from the viewBox ratio', () => {
    expect(imageSizeOf(svgBytes('width="120" viewBox="0 0 240 100"'))).toEqual(
      dim(120, 50),
    );
    expect(imageSizeOf(svgBytes('height="40" viewBox="0 0 240 120"'))).toEqual(
      dim(80, 40),
    );
  });

  it('rejects SVG sizes it cannot resolve', () => {
    // Percent widths have no viewport to resolve against; pt units are not
    // converted; zero sizes and missing sizes without a viewBox yield null.
    expect(imageSizeOf(svgBytes('width="100%" height="50"'))).toBeNull();
    expect(imageSizeOf(svgBytes('width="10pt" height="10pt"'))).toBeNull();
    expect(imageSizeOf(svgBytes('width="0" height="10"'))).toBeNull();
    expect(imageSizeOf(svgBytes(''))).toBeNull();
  });

  it('returns null for unknown and empty buffers', () => {
    expect(imageSizeOf(Buffer.from('BM....'))).toBeNull(); // BMP: silent skip
    expect(imageSizeOf(Buffer.alloc(0))).toBeNull();
    expect(imageSizeOf(Buffer.from('<html>not an image</html>'))).toBeNull();
  });
});

// -- localImageSize (file resolution + cache) ---------------------------------

describe('localImageSize', () => {
  const tmpDirs: string[] = [];
  afterAll(async () => {
    await Promise.all(
      tmpDirs.map(dir => rm(dir, { recursive: true, force: true })),
    );
  });

  async function fixture(
    files: Record<string, Buffer>,
  ): Promise<{ dir: string; env: MarkdownEnv }> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ap-imgsize-'));
    tmpDirs.push(dir);
    await Promise.all(
      Object.entries(files).map(async ([rel, body]) => {
        await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
        await writeFile(path.join(dir, rel), body);
      }),
    );
    return { dir, env: { filePath: path.join(dir, 'post.md') } };
  }

  it('resolves relative srcs against the md file and reads real sizes', async () => {
    const fx = await fixture({
      'pic.png': pngBytes(4, 9),
      'sub/s.gif': gifBytes('GIF89a', 7, 8),
    });
    expect(localImageSize('./pic.png', fx.env)).toEqual(dim(4, 9));
    expect(localImageSize('./sub/s.gif', fx.env)).toEqual(dim(7, 8));
    // `..` segments normalize back onto the same file.
    expect(localImageSize('./sub/../pic.png', fx.env)).toEqual(dim(4, 9));
  });

  it('stays silent for remote, public-root and missing images', async () => {
    const fx = await fixture({ 'pic.png': pngBytes(4, 9) });
    expect(localImageSize('https://cdn.example.com/x.png', fx.env)).toBeNull();
    expect(localImageSize('//cdn.example.com/x.png', fx.env)).toBeNull();
    expect(localImageSize('data:image/png;base64,AAAA', fx.env)).toBeNull();
    expect(localImageSize('/logo.png', fx.env)).toBeNull();
    expect(localImageSize('./missing.png', fx.env)).toBeNull();
  });

  it('caches by mtime: one read per edit, none per repeat', async () => {
    const fx = await fixture({ 'pic.png': pngBytes(4, 9) });
    const read = vi.spyOn(fs, 'readFileSync');
    try {
      expect(localImageSize('./pic.png', fx.env)).toEqual(dim(4, 9));
      expect(localImageSize('./pic.png', fx.env)).toEqual(dim(4, 9));
      expect(localImageSize('./pic.png', fx.env)).toEqual(dim(4, 9));
      expect(read).toHaveBeenCalledTimes(1);

      // Same path, new bytes (and a deterministically fresh mtime): re-read.
      await writeFile(path.join(fx.dir, 'pic.png'), pngBytes(5, 6));
      fs.utimesSync(
        path.join(fx.dir, 'pic.png'),
        new Date(2000),
        new Date(3000),
      );
      expect(localImageSize('./pic.png', fx.env)).toEqual(dim(5, 6));
      expect(read).toHaveBeenCalledTimes(2);
    } finally {
      read.mockRestore();
    }
  });
});
