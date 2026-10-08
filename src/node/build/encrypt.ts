import { createHash } from 'node:crypto';

import type { PagePayload, SiteConfig } from '../../shared/types.ts';
import { normalizeRouteForMatch } from './route-match.ts';

type EncryptRules = SiteConfig['encrypt'];
type EncryptedPayload = NonNullable<PagePayload['encrypted']>;

/** Lowercase sha256 hex; must match the client (WebCrypto) implementation. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// The same rule's passwords are re-hashed for every gated page; sites have
// few, static passwords, so a plain memo map suffices. Keys hold plaintext
// in memory only — never logged, never emitted (payloads carry the digest).
const SHA256_MEMO = new Map<string, string>();

function sha256HexMemo(input: string): string {
  let hex = SHA256_MEMO.get(input);
  if (hex === undefined) {
    hex = sha256Hex(input);
    SHA256_MEMO.set(input, hex);
  }
  return hex;
}

/**
 * Rule matcher: a string matches the route exactly, a RegExp is tested
 * against it (avoid the /g flag — `test` on a stateful regex is order
 * dependent). Both sides run through normalizeRouteForMatch, so CJK paths
 * match in plain unencoded form; regexes therefore also see the decoded
 * route.
 */
export function matchesRoute(match: RegExp | string, route: string): boolean {
  const normalized = normalizeRouteForMatch(route);
  return typeof match === 'string'
    ? normalizeRouteForMatch(match) === normalized
    : match.test(normalized);
}

/**
 * Resolve the password gate for a route. The first matching rule wins;
 * returns null when the route is not gated. Passwords are only ever
 * emitted as sha256 hex — plaintext never reaches the page payload.
 */
export function encryptRuleFor(
  route: string,
  rules: EncryptRules,
): EncryptedPayload | null {
  const rule = rules?.find(r => matchesRoute(r.match, route));
  if (!rule) return null;
  return {
    hashes: rule.passwords.map(sha256HexMemo),
    ...(rule.hint !== undefined ? { hint: rule.hint } : {}),
  };
}

/**
 * robots.txt Disallow paths of the string rules, match-normalized (decoded,
 * like the matching side, so CJK paths ship in plain form). robots patterns
 * are plain path prefixes, so RegExp rules have no faithful encoding and are
 * skipped (documented). Duplicated paths collapse to one line.
 */
export function encryptDisallowPaths(rules: EncryptRules): string[] {
  const paths = new Set<string>();
  for (const rule of rules ?? []) {
    if (typeof rule.match === 'string') {
      paths.add(normalizeRouteForMatch(rule.match));
    }
  }
  return [...paths];
}
