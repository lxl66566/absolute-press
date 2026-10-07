import { describe, expect, it, vi } from 'vitest';

import { isContentFile, reportBareLinks } from '../plugin.ts';

const CONTENT = '/srv/blog/content';

describe('isContentFile', () => {
  it('accepts markdown files inside the content dir', () => {
    expect(isContentFile(`${CONTENT}/a.md`, CONTENT)).toBe(true);
    expect(isContentFile(`${CONTENT}/essay/2022.md`, CONTENT)).toBe(true);
  });

  it('rejects sibling dirs sharing the content dir name prefix', () => {
    expect(isContentFile('/srv/blog/content-draft/a.md', CONTENT)).toBe(false);
    expect(isContentFile('/srv/blog/content_backup/a.md', CONTENT)).toBe(false);
  });

  it('rejects files outside the content dir', () => {
    expect(isContentFile('/srv/blog/about.md', CONTENT)).toBe(false);
  });

  it('rejects non-markdown files inside the content dir', () => {
    expect(isContentFile(`${CONTENT}/img/logo.png`, CONTENT)).toBe(false);
  });

  it('matches every path under a root content dir', () => {
    expect(isContentFile('/any/page.md', '/')).toBe(true);
    expect(isContentFile('/any/img.png', '/')).toBe(false);
  });

  it('normalizes windows separators on both sides', () => {
    expect(isContentFile('C:\\blog\\content\\a.md', 'C:\\blog\\content')).toBe(
      true,
    );
    expect(
      isContentFile('C:\\blog\\content-draft\\a.md', 'C:\\blog\\content'),
    ).toBe(false);
  });
});

describe('reportBareLinks', () => {
  const links = [{ file: 'content/a.md', raw: 'guide/x.md', line: 3 }];

  /** fail hook that mirrors vite's this.error (throws). */
  const fail = (message: string): never => {
    throw new Error(message);
  };

  it('fails the build under the error policy', () => {
    expect(() => reportBareLinks(links, 'error', fail)).toThrowError(
      /1 bare relative link\(s\).*content\/a\.md:3 -> guide\/x\.md/s,
    );
  });

  it('warns and passes under the warn policy', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      reportBareLinks(links, 'warn', fail);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('bare relative link(s)'),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("'off' to silence"),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('stays silent under the off policy and with no bare links', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      reportBareLinks(links, 'off', fail);
      reportBareLinks([], 'warn', fail);
      reportBareLinks([], 'error', fail);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
