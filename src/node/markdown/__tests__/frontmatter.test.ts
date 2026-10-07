import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { MarkdownRenderer } from '../../../shared/types.ts';
import { parseFrontmatter } from '../frontmatter.ts';
import { ENV, makeRenderer } from './helpers.ts';

let md: MarkdownRenderer;
beforeAll(async () => {
  md = await makeRenderer();
});

const renderDate = (src: string): string | undefined =>
  md.render(src, ENV).frontmatter.date;

describe('frontmatter', () => {
  it('extracts only the recognized keys and strips the block from the body', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = [
      '---',
      'title: ignored',
      'date: 2024-01-05',
      'category: [coding]',
      'tag: note',
      'icon: book',
      'feed: false',
      'overview: false',
      'unknown: dropped',
      '---',
      '',
      '# Body',
    ].join('\n');
    const result = md.render(src, ENV);
    expect(result.frontmatter).toEqual({
      date: '2024-01-05',
      category: ['coding'],
      tag: ['note'],
      icon: 'book',
      feed: false,
      overview: false,
    });
    expect(result.html).toContain('<h1 id="body">Body</h1>');
    expect(result.html).not.toContain('unknown');
  });

  it('normalizes yaml Date objects to ISO dates', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = md.render('---\ndate: 2024-12-31\n---\n\nx', ENV);
    expect(result.frontmatter.date).toBe('2024-12-31');
  });

  it('keeps the written calendar date for zoneless timestamps', () => {
    // js-yaml constructs zoneless stamps via Date.UTC, so the written
    // components survive as UTC ones; slicing the UTC date keeps both an
    // early and a late moment on the written day on any host timezone
    // (local-component formatting would push 23:30 into the next day on
    // UTC+ hosts). Seconds are mandatory in js-yaml's stamp regex.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(renderDate('---\ndate: 2024-12-31T00:30:00\n---\n\nx')).toBe(
      '2024-12-31',
    );
    expect(renderDate('---\ndate: 2024-12-31T23:30:00\n---\n\nx')).toBe(
      '2024-12-31',
    );
  });

  it('passes zoneless stamps without seconds through as plain strings', () => {
    // `2024-12-31 00:30` fails js-yaml's timestamp regex and stays a string;
    // locked here so the passthrough cannot drift silently.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = md.render('---\ndate: 2024-12-31 00:30\n---\n\nx', ENV);
    expect(result.frontmatter.date).toBe('2024-12-31 00:30');
  });

  it('warns once about unknown top-level keys, with file and key names', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    md.render('---\ntags: typo\nunknown: 1\n---\n\nx', ENV);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('post.md');
    expect(warn.mock.calls[0]?.[0]).toContain('tags');
    expect(warn.mock.calls[0]?.[0]).toContain('unknown');
  });

  it('does not warn when every key is recognized', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    md.render(
      '---\ndate: 2024-01-05\ncategory: a\ntag: b\nicon: c\nfeed: true\noverview: true\n---\n\nx',
      ENV,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns empty frontmatter without a block', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(md.render('plain', ENV).frontmatter).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('parseFrontmatter overview', () => {
  it('extracts booleans and drops non-boolean values', () => {
    expect(
      parseFrontmatter('---\noverview: false\n---\n\nx').frontmatter,
    ).toEqual({
      overview: false,
    });
    expect(
      parseFrontmatter('---\noverview: true\n---\n\nx').frontmatter,
    ).toEqual({
      overview: true,
    });
    // Quoted so js-yaml keeps it a string (bare `no` parses as boolean
    // false); a string here is a typo and must not reach the payload.
    expect(
      parseFrontmatter('---\noverview: "no"\n---\n\nx').frontmatter,
    ).toEqual({});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
