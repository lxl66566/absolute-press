import { createHash } from 'node:crypto';

import type { PageChrome } from '../../shared/types.ts';

/**
 * The shared chrome asset of one locale: `site.icons` + the navbar/sidebar
 * trees are identical for every page of a locale (the sidebar's active
 * state is client-side), so the build ships them once as a content-hashed
 * ES module instead of inlining them into every page's `__AP_DATA__`. On
 * icon-heavy sites (a full FontAwesome registration) that table dominates
 * the per-page document — measured ~65% of the gzipped homepage — while
 * MPA re-navigations and prerenders refetch and reparse it every time.
 *
 * The file name hashes the serialized source: the asset is immutable
 * (`/assets/*` cache rule) and rebuilds keep the name stable until the
 * chrome content actually changes. Two locales with byte-identical chrome
 * share one file.
 */
export function chromeAsset(data: PageChrome): {
  fileName: string;
  source: string;
} {
  // JSON is a valid JS object literal, and as an external .js file it needs
  // no `</script>` escaping (only inline payloads do).
  const source = `export default ${JSON.stringify(data)};\n`;
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  return { fileName: `assets/chrome-${hash}.js`, source };
}
