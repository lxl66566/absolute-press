import { describe, expect, it } from 'vitest';

import { encryptRuleFor, matchesRoute, sha256Hex } from '../encrypt.ts';

describe('sha256Hex', () => {
  it('matches known sha256 vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('test1234')).toBe(
      '937e8d5fbb48bd4949536cd65b8d35c426b80d2f830c5c308e2cdec422ae2244',
    );
  });

  it('is utf8-safe for CJK input', () => {
    expect(sha256Hex('密码')).toBe(
      'a621ab606db2a11f63edc576a729843b8269250dc324206871d90635ac5e531c',
    );
  });
});

describe('matchesRoute', () => {
  it('string matches exactly', () => {
    expect(matchesRoute('/a/b.html', '/a/b.html')).toBe(true);
    // Trailing/duplicate slashes are match-normalized on both sides.
    expect(matchesRoute('/a/b.html', '/a/b.html/')).toBe(true);
    expect(matchesRoute('/a//b.html', '/a/b.html')).toBe(true);
    expect(matchesRoute('/a/b', '/a/b.html')).toBe(false);
  });

  it('regexp tests against the route', () => {
    expect(matchesRoute(/^\/hide\//, '/hide/x.html')).toBe(true);
    expect(matchesRoute(/^\/hide\//, '/show/x.html')).toBe(false);
    expect(matchesRoute(/\.html$/, '/a.html')).toBe(true);
  });

  it('matches CJK routes written unencoded against encoded routes', () => {
    // Routes are emitted percent-encoded (see routeOf).
    const encoded = `/${encodeURIComponent('私密')}/x.html`;
    expect(matchesRoute('/私密/x.html', encoded)).toBe(true);
    expect(matchesRoute(/私密/, encoded)).toBe(true);
    expect(matchesRoute('/其他/x.html', encoded)).toBe(false);
  });

  it('stays compatible with legacy percent-encoded string patterns', () => {
    const encoded = `/${encodeURIComponent('私密')}/x.html`;
    expect(matchesRoute(encoded, encoded)).toBe(true);
  });

  it('tolerates malformed percent sequences instead of throwing', () => {
    expect(matchesRoute('/100%.html', '/100%.html')).toBe(true);
    expect(matchesRoute(/^\/100/, '/100%.html')).toBe(true);
  });
});

describe('encryptRuleFor', () => {
  const rules = [
    { match: '/a.html', passwords: ['pw1'], hint: 'hint-a' },
    { match: /^\/b\//, passwords: ['pw2', 'pw3'] },
  ];

  it('returns hashes and hint for a matching rule', () => {
    expect(encryptRuleFor('/a.html', rules)).toEqual({
      hashes: [sha256Hex('pw1')],
      hint: 'hint-a',
    });
  });

  it('hashes every password of the rule', () => {
    expect(encryptRuleFor('/b/x.html', rules)).toEqual({
      hashes: [sha256Hex('pw2'), sha256Hex('pw3')],
    });
  });

  it('omits hint when absent', () => {
    expect(encryptRuleFor('/b/x.html', rules)).not.toHaveProperty('hint');
  });

  it('returns null for ungated routes or empty rules', () => {
    expect(encryptRuleFor('/other.html', rules)).toBeNull();
    expect(encryptRuleFor('/a.html', undefined)).toBeNull();
    expect(encryptRuleFor('/a.html', [])).toBeNull();
  });

  it('hashes identically across repeated calls (memoized per password)', () => {
    expect(encryptRuleFor('/a.html', rules)).toEqual(
      encryptRuleFor('/a.html', rules),
    );
  });

  it('never emits plaintext passwords', () => {
    const payload = encryptRuleFor('/a.html', rules);
    expect(JSON.stringify(payload)).not.toContain('pw1');
  });
});
