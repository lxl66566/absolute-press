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
      'updated: 2024-02-06',
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
      updated: '2024-02-06',
      category: ['coding'],
      tag: ['note'],
      icon: 'book',
      feed: false,
      overview: false,
    });
    expect(result.html).toContain('<h1 id="body">Body</h1>');
    expect(result.html).not.toContain('unknown');
  });

  it('keeps bare date-only stamps as written', () => {
    // The yaml engine keeps timestamps as strings (no Date coercion), so
    // an unquoted date takes the same path as a quoted one: date-only
    // strings stay verbatim on the default UTC zone.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = md.render('---\ndate: 2024-12-31\n---\n\nx', ENV);
    expect(result.frontmatter.date).toBe('2024-12-31');
  });

  it('normalizes zoneless timestamps to UTC ISO, time preserved', () => {
    // Unquoted stamps take the same string path as quoted ones (the yaml
    // engine drops the Date coercion); both normalize to the T/Z form so
    // downstream `new Date()` cannot parse them in the build host's local
    // zone. Unlike the old Date branch — which sliced the time off — the
    // wall time survives into `createdAt`.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(renderDate('---\ndate: 2024-12-31T00:30:00\n---\n\nx')).toBe(
      '2024-12-31T00:30:00Z',
    );
    expect(renderDate('---\ndate: 2024-12-31T23:30:00\n---\n\nx')).toBe(
      '2024-12-31T23:30:00Z',
    );
  });

  it('normalizes quoted zoneless stamps to UTC ISO', () => {
    // `2024-12-31 00:30` fails js-yaml's timestamp regex and stays a string;
    // the string branch rewrites it to the T/Z form so downstream `new
    // Date()` cannot parse it in the build host's local zone (see
    // frontmatter-tz.test.ts for the timezone-sensitive assertions).
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = md.render('---\ndate: 2024-12-31 00:30\n---\n\nx', ENV);
    expect(result.frontmatter.date).toBe('2024-12-31T00:30:00Z');
  });

  it('parses updated with the same date shapes as date', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const string = md.render('---\nupdated: 2024-12-31 00:30\n---\n\nx', ENV)
      .frontmatter.updated;
    expect(string).toBe('2024-12-31T00:30:00Z');
    const bare = md.render('---\nupdated: 2024-12-31\n---\n\nx', ENV)
      .frontmatter.updated;
    expect(bare).toBe('2024-12-31');
  });

  it('stays silent in the renderer; the site scan owns unknown-key warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    md.render('---\ntags: typo\nunknown: 1\n---\n\nx', ENV);
    expect(warn).not.toHaveBeenCalled();
    parseFrontmatter('---\ntags: typo\n---\nx', { filePath: 'post.md' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('post.md');
    expect(warn.mock.calls[0]?.[0]).toContain('tags');
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

describe('parseFrontmatter description', () => {
  it('extracts strings and drops non-string values', () => {
    expect(
      parseFrontmatter('---\ndescription: Site summary.\n---\n\nx').frontmatter,
    ).toEqual({
      description: 'Site summary.',
    });
    expect(
      parseFrontmatter('---\ndescription: [a, b]\n---\n\nx').frontmatter,
    ).toEqual({});
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
