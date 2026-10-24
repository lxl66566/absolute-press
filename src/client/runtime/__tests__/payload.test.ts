import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PagePayload } from '../../../shared/types';
import {
  chromeUrlOf,
  commitChrome,
  loadChrome,
  mergeChrome,
  pagePayload,
} from '../payload';

function payloadJson(): string {
  const payload: PagePayload = {
    site: {
      title: 'T',
      description: 'd',
      base: '',
      locales: [{ key: 'root', lang: 'zh-CN', label: 'zh', prefix: '' }],
      locale: 'root',
    },
    navbar: [],
    sidebar: [],
    page: {
      route: '/a',
      locale: 'root',
      title: 'A',
      headings: [],
      frontmatter: {},
      createdAt: null,
      updatedAt: null,
    },
  };
  return JSON.stringify(payload);
}

function useDocument(html: string): void {
  vi.stubGlobal('document', parseHTML(html).document);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pagePayload', () => {
  it('parses the payload script', () => {
    useDocument(
      `<html><body><script type="application/json" id="__AP_DATA__">${payloadJson()}</script></body></html>`,
    );
    const payload = pagePayload();
    expect(payload?.site.title).toBe('T');
    expect(payload?.page.route).toBe('/a');
  });

  it('returns null when the script is absent', () => {
    useDocument('<html><body><p>plain</p></body></html>');
    expect(pagePayload()).toBeNull();
  });

  it('returns null and logs on unparsable JSON', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    useDocument(
      '<html><body><script type="application/json" id="__AP_DATA__">{oops</script></body></html>',
    );
    expect(pagePayload()).toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('__AP_DATA__'),
      expect.anything(),
    );
  });
});

/** A build-shaped payload: chrome fields replaced by the asset reference. */
function externalJson(): string {
  return JSON.stringify({
    site: {
      title: 'T',
      description: 'd',
      base: '',
      locales: [{ key: 'root', lang: 'zh-CN', label: 'zh', prefix: '' }],
      locale: 'root',
    },
    chrome: 'assets/chrome-0123abcd.js',
    page: {
      route: '/a',
      locale: 'root',
      title: 'A',
      headings: [],
      frontmatter: {},
      createdAt: null,
      updatedAt: null,
    },
  });
}

/** Load a chrome module from inline source (no fs) into the runtime. */
async function loadChromeData(data: unknown): Promise<void> {
  const url = `data:text/javascript,export default ${JSON.stringify(data)}`;
  const chrome = await loadChrome(url);
  expect(chrome).not.toBeNull();
  commitChrome(url, chrome!);
}

describe('chrome externalization', () => {
  // mergeChrome/commitChrome keep module state; these tests run in sequence
  // and the committed module persists across them, mirroring the runtime.

  it('mergeChrome is a no-op before any chrome is loaded', () => {
    const parsed = JSON.parse(externalJson()) as PagePayload;
    expect(mergeChrome(parsed).navbar).toBeUndefined();
  });

  it('pagePayload merges the loaded chrome module back in', async () => {
    await loadChromeData({
      icons: { 'solid/x': '<svg/>' },
      navbar: [{ kind: 'leaf', text: 'A', link: '/a' }],
      sidebar: [],
    });
    useDocument(
      `<html><body><script type="application/json" id="__AP_DATA__">${externalJson()}</script></body></html>`,
    );
    const payload = pagePayload();
    expect(payload?.navbar).toEqual([{ kind: 'leaf', text: 'A', link: '/a' }]);
    expect(payload?.sidebar).toEqual([]);
    expect(payload?.site.icons).toEqual({ 'solid/x': '<svg/>' });
    // The raw script keeps the slim serialized form.
    expect(document.getElementById('__AP_DATA__')?.textContent).not.toContain(
      '"navbar"',
    );
  });

  it('chromeUrlOf resolves the reference against a base and mirrors chrome-less payloads', () => {
    const parsed = JSON.parse(externalJson()) as PagePayload;
    expect(chromeUrlOf(parsed, 'https://x.test/guide/a')).toBe(
      'https://x.test/guide/assets/chrome-0123abcd.js',
    );
    expect(chromeUrlOf(parsed, 'https://x.test/')).toBe(
      'https://x.test/assets/chrome-0123abcd.js',
    );
    expect(
      chromeUrlOf(JSON.parse(payloadJson()) as PagePayload, '/'),
    ).toBeNull();
  });

  it('loadChrome returns the module data without committing it', async () => {
    const data = { navbar: [{ kind: 'leaf', text: 'B', link: '/b' }] };
    const url = `data:text/javascript,export default ${JSON.stringify(data)}`;
    expect(await loadChrome(url)).toEqual(data);
    // Module state is untouched: the loaded chrome must not leak into
    // mergeChrome until the caller commits (the router commits only after
    // its seq check, so a superseded navigation never overwrites).
    const parsed = JSON.parse(externalJson()) as PagePayload;
    expect(mergeChrome(parsed).navbar).toEqual([
      { kind: 'leaf', text: 'A', link: '/a' },
    ]);
  });

  it('commitChrome installs the module for mergeChrome', async () => {
    const data = { navbar: [{ kind: 'leaf', text: 'C', link: '/c' }] };
    const url = `data:text/javascript,export default ${JSON.stringify(data)}`;
    commitChrome(url, (await loadChrome(url))!);
    const parsed = JSON.parse(externalJson()) as PagePayload;
    expect(mergeChrome(parsed).navbar).toEqual(data.navbar);
  });

  it('loadChrome reports load failures without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Not a valid module: the import rejects and the loader reports it.
    expect(await loadChrome('data:text/javascript,=')).toBeNull();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('chrome asset'),
      expect.anything(),
      expect.anything(),
    );
  });
});
