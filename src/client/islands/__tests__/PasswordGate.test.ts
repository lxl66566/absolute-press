import { describe, expect, it } from 'vitest';

// Extensionless here (client-side specifier style); the node module keeps
// its own explicit .ts specifiers for plain-node ESM.
import { sha256Hex as nodeSha256Hex } from '../../../node/build/encrypt';
import { gateStorageKeys, pickSavedHash, sha256Hex } from '../PasswordGate';

// The two implementations are parallel by design (WebCrypto vs node:crypto);
// drift silently locks users out of gated pages, so every vector asserts
// client === node, and the known-answer values mirror encrypt.test.ts.
describe('client sha256Hex parity with node', () => {
  // Known-answer vectors from the node-side test suite.
  const known: [input: string, expected: string][] = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    [
      'test1234',
      '937e8d5fbb48bd4949536cd65b8d35c426b80d2f830c5c308e2cdec422ae2244',
    ],
    [
      '密码',
      'a621ab606db2a11f63edc576a729843b8269250dc324206871d90635ac5e531c',
    ],
  ];

  // Parity-only vectors: no precomputed digest, client must equal node.
  const parity = [
    '密码门🎉door🚪',
    'x'.repeat(100_000),
    'line\u2028break&nbsp;<b>&"</b>',
  ];

  it.each(known)('matches the known digest of %j', async (input, expected) => {
    expect(await sha256Hex(input)).toBe(expected);
    expect(nodeSha256Hex(input)).toBe(expected);
  });

  it.each(parity)('agrees with node:crypto on %j', async input => {
    expect(await sha256Hex(input)).toBe(nodeSha256Hex(input));
  });

  it('produces lowercase 64-char hex', async () => {
    expect(await sha256Hex('anything')).toMatch(/^[0-9a-f]{64}$/);
  });
});

/** In-memory Storage reader for pickSavedHash. */
const reader =
  (store: Record<string, string>) =>
  (key: string): string | null =>
    store[key] ?? null;

describe('remembered unlocks (L13)', () => {
  const PATH = '/gossip/job';
  const SESSION = `ap-gate:${PATH}`;
  const SAVED = `ap-gate-saved:${PATH}`;
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);

  it('scopes both storage keys to the page route', () => {
    expect(gateStorageKeys(PATH)).toEqual([SESSION, SAVED]);
    expect(gateStorageKeys('/a')).not.toEqual(gateStorageKeys('/b'));
  });

  it('prefers the session hash over the remember-me hash', () => {
    expect(
      pickSavedHash(
        reader({ [SESSION]: HASH_A, [SAVED]: HASH_B }),
        [HASH_A, HASH_B],
        PATH,
      ),
    ).toBe(HASH_A);
  });

  it('falls back to the remember-me hash when the session has none', () => {
    expect(pickSavedHash(reader({ [SAVED]: HASH_B }), [HASH_B], PATH)).toBe(
      HASH_B,
    );
  });

  it('ignores saved hashes the page no longer accepts', () => {
    expect(pickSavedHash(reader({ [SAVED]: HASH_B }), [HASH_A], PATH)).toBe(
      null,
    );
    expect(pickSavedHash(reader({}), [HASH_A], PATH)).toBe(null);
  });
});
