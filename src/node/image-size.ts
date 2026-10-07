/**
 * Build-time intrinsic image sizes, used to inject width/height attributes
 * on rendered <img> tags so the browser reserves layout space before the
 * bytes arrive (CLS). Zero-dependency header sniffing for PNG/JPEG/GIF/WebP
 * plus a minimal SVG attribute reader; exotic containers (BMP, ICO, ...)
 * silently yield null — sizing is an enhancement, never a build blocker,
 * and dead image paths stay the link resolver's business.
 */
import fs from 'node:fs';
import path from 'node:path';

import { isExternalHref } from '../shared/links.ts';
import type { MarkdownEnv } from '../shared/types.ts';

/** Intrinsic pixel size of an image. */
export interface ImageDimension {
  width: number;
  height: number;
}

/** Pure sniffer: dimensions of an image buffer, null for unknown formats. */
export function imageSizeOf(buf: Buffer): ImageDimension | null {
  if (isPng(buf)) return pngSize(buf);
  if (isGif(buf)) return gifSize(buf);
  if (isWebP(buf)) return webpSize(buf);
  if (isJpeg(buf)) return jpegSize(buf);
  return svgSize(buf);
}

// -- PNG --------------------------------------------------------------------

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf: Buffer): boolean {
  return buf.length >= 24 && buf.subarray(0, 8).equals(PNG_SIG);
}

/** IHDR is always the first chunk: length(4) 'IHDR'(4) width(4) height(4). */
function pngSize(buf: Buffer): ImageDimension {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// -- GIF --------------------------------------------------------------------

function isGif(buf: Buffer): boolean {
  return buf.length >= 10 && buf.subarray(0, 3).toString('latin1') === 'GIF';
}

/** Logical screen descriptor right behind the 6-byte signature. */
function gifSize(buf: Buffer): ImageDimension {
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

// -- WebP --------------------------------------------------------------------

function isWebP(buf: Buffer): boolean {
  return (
    buf.length >= 16 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  );
}

/** First chunk's fourcc picks the sub-format; each packs its own header. */
function webpSize(buf: Buffer): ImageDimension | null {
  const chunk = buf.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8 ') {
    // Lossy: 3-byte frame tag, then the 0x9d 0x01 0x2a sync, then the
    // 14-bit frame sizes.
    if (
      buf.length < 30 ||
      buf[23] !== 0x9d ||
      buf[24] !== 1 ||
      buf[25] !== 0x2a
    )
      return null;
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    // Lossless: 0x2f signature, then 14-bit size-1 values packed LSB first.
    if (buf.length < 25 || buf[20] !== 0x2f) return null;
    const b0 = buf[21] ?? 0;
    const b1 = buf[22] ?? 0;
    const b2 = buf[23] ?? 0;
    const b3 = buf[24] ?? 0;
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === 'VP8X') {
    // Extended: flags(1) reserved(3), then the 24-bit canvas size-1 pair.
    if (buf.length < 30) return null;
    return {
      width: buf.readUIntLE(24, 3) + 1,
      height: buf.readUIntLE(27, 3) + 1,
    };
  }
  return null;
}

// -- JPEG --------------------------------------------------------------------

function isJpeg(buf: Buffer): boolean {
  return (
    buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  );
}

/** Walk marker segments until a frame header (SOFn) carries the size. */
function jpegSize(buf: Buffer): ImageDimension | null {
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // fill bytes between segments
      continue;
    }
    // Standalone markers (TEM, RSTn) carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // SOFn (C0-CF minus DHT/JPG/DAC): length(2) precision(1) height(2) width(2).
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      if (i + 9 > buf.length) return null;
      return {
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
      };
    }
    const length = buf.readUInt16BE(i + 2);
    if (length < 2) return null; // corrupt; also guards the loop's progress
    i += 2 + length;
  }
  return null;
}

// -- SVG ---------------------------------------------------------------------

/** Attribute scan bound: the root <svg> tag sits in the document head. */
const SVG_HEAD_BYTES = 64 * 1024;

/** Unitless/px length as a number; %, pt, em... stay unrecognized (no
 * viewport to resolve them against). */
function svgPxLength(value: string | null): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/i.exec(value ?? '');
  return m ? Number(m[1]) : null;
}

function roundDimension(width: number, height: number): ImageDimension {
  return { width: Math.round(width), height: Math.round(height) };
}

function svgSize(buf: Buffer): ImageDimension | null {
  const head = buf
    .subarray(0, Math.min(buf.length, SVG_HEAD_BYTES))
    .toString('utf8');
  const tag = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!tag) return null;
  const attr = (name: string): string | null => {
    const m = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag);
    return m?.[2] ?? null;
  };
  const viewBox = (): [number, number] | null => {
    const parts = (attr('viewBox') ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const w = parts[2];
    const h = parts[3];
    return parts.length === 4 &&
      parts.every(n => Number.isFinite(n)) &&
      w !== undefined &&
      h !== undefined &&
      w > 0 &&
      h > 0
      ? [w, h]
      : null;
  };
  const width = svgPxLength(attr('width'));
  const height = svgPxLength(attr('height'));
  if (width !== null && height !== null) {
    return width > 0 && height > 0 ? roundDimension(width, height) : null;
  }
  // A partial pair is completed from the viewBox ratio so the injected
  // attributes keep the author's given dimension instead of overriding it.
  const box = viewBox();
  if (width !== null && width > 0 && box) {
    return roundDimension(width, (width * box[1]) / box[0]);
  }
  if (height !== null && height > 0 && box) {
    return roundDimension((height * box[0]) / box[1], height);
  }
  // No usable attributes: the viewBox itself is the natural size (the
  // aspect ratio is what CLS prevention needs).
  if (box) return roundDimension(box[0], box[1]);
  return null;
}

// -- File resolution (renderer option wiring) --------------------------------

/**
 * MarkdownOptions.imageSize implementation for SiteStore's renderer: the
 * intrinsic size of a local image. "Local" matches
 * LinkResolver.resolveImage's copy set — relative srcs resolved against the
 * md file. Scheme'd (incl. data:), protocol-relative and site-absolute
 * (public root) srcs yield null; so do missing files, silently — the
 * dead-link report owns those, sizing must not duplicate it.
 */
export function localImageSize(
  src: string,
  env: MarkdownEnv,
): ImageDimension | null {
  if (src === '' || isExternalHref(src) || src.startsWith('/')) return null;
  return imageSizeFromFile(path.resolve(path.dirname(env.filePath), src));
}

interface SizeCacheEntry {
  mtimeMs: number;
  dim: ImageDimension | null;
}

/** abs path -> size, keyed by mtime (one stat per lookup, one read per edit). */
const cache = new Map<string, SizeCacheEntry>();

function imageSizeFromFile(abs: string): ImageDimension | null {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(abs).mtimeMs;
  } catch {
    return null; // missing: nothing to key a cache entry on
  }
  const cached = cache.get(abs);
  if (cached && cached.mtimeMs === mtimeMs) return cached.dim;
  let dim: ImageDimension | null = null;
  try {
    dim = imageSizeOf(fs.readFileSync(abs));
  } catch {
    // Unreadable (e.g. a directory): cached as dimension-less per mtime.
  }
  cache.set(abs, { mtimeMs, dim });
  return dim;
}
