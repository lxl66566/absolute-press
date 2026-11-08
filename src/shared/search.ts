/**
 * Local-search contract shared by the build layer (doc producer) and the
 * client runtime (doc consumer): the index asset ships plain documents and
 * the client builds the MiniSearch index on first open — one download, no
 * duplicated serialized index, and tokenization stays identical on both
 * sides of the wire because the tokenizer lives here too.
 */

/** One searchable section (page split at heading boundaries) of one page. */
export interface SearchDoc {
  /** MiniSearch document key: `route` or `route#anchor`. */
  id: string;
  /** Locale-prefixed clean route of the page. */
  route: string;
  /** Locale key of the page; the client filters results to the page locale. */
  locale: string;
  /** Page title (first h1). */
  title: string;
  /** Section heading plain text; '' for the block before the first heading. */
  heading: string;
  /** Section anchor id; '' links to the page itself. */
  anchor: string;
  /** Plain-text body of the section (tags stripped, entities decoded). */
  text: string;
}

/** Shape of the emitted `assets/search-*.js` / dev endpoint module. */
export interface SearchIndexAsset {
  docs: SearchDoc[];
}

/**
 * Tokenizer for the local search index: Latin/numeric runs fold to lowercase
 * words; Han/Hiragana/Katakana runs (no spaces to split on) become
 * overlapping bigrams, so a query for any contiguous 2+ characters of a CJK
 * passage matches, and single-character runs stay unigrams. Used for both
 * indexing and querying (MiniSearch falls back to the constructor tokenizer
 * at query time), so index and query vocabularies can never drift apart.
 */
export function searchTokens(input: string): string[] {
  const tokens: string[] = [];
  let word = '';
  let cjk = '';
  const flushWord = (): void => {
    if (word !== '') {
      tokens.push(word);
      word = '';
    }
  };
  const flushCjk = (): void => {
    if (cjk === '') return;
    if (cjk.length === 1) tokens.push(cjk);
    else {
      // Code-point iteration above keeps surrogate pairs whole, so slicing
      // here can never cut one in half.
      for (let i = 0; i + 2 <= cjk.length; i++) {
        tokens.push(cjk.slice(i, i + 2));
      }
    }
    cjk = '';
  };
  for (const ch of input) {
    if (CJK_CHAR.test(ch)) {
      flushWord();
      cjk += ch;
    } else if (WORD_CHAR.test(ch)) {
      flushCjk();
      word += ch.toLowerCase();
    } else {
      flushWord();
      flushCjk();
    }
  }
  flushWord();
  flushCjk();
  return tokens;
}

const CJK_CHAR =
  /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\u30FC/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;
