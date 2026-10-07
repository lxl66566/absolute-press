import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PagePayload } from '../../../shared/types';
import { pagePayload } from '../payload';

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
      route: '/a.html',
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
    expect(payload?.page.route).toBe('/a.html');
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
