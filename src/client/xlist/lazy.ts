/**
 * Lazy loading of externalized entry-list bodies (config
 * `xlist.externalize`, see src/node/build/xlist-asset.ts): the build ships
 * a list's bodies as `export default string[]` (indexed by the static
 * table's `data-ap-slot` row markers) and the island fetches the module
 * once after mount, then fills its slot rows.
 *
 * Mirrors runtime/terms.ts: one in-flight promise per absolute url, cached
 * across soft navigations, failures downgrade to empty bodies with a
 * console error. Urls resolve from the clientRoute/clientBase signals —
 * applyPage updates both before hydration, so document.baseURI (still the
 * outgoing page until pushState) is never consulted.
 */
import { withBase } from '../../shared/links';
import { clientBase, clientRoute } from '../theme/state';

const cache = new Map<string, Promise<string[] | null>>();

function resolveUrl(src: string): string {
  return new URL(withBase(clientBase(), src), location.origin + clientRoute())
    .href;
}

/** Loaded bodies for one island asset; null = the fetch failed. */
export function ensureEntryBodies(src: string): Promise<string[] | null> {
  const url = resolveUrl(src);
  let cached = cache.get(url);
  if (cached === undefined) {
    cached = (import(/* @vite-ignore */ url) as Promise<{ default: string[] }>)
      .then(m => m.default)
      .catch((e: unknown) => {
        console.error('[absolute-press] failed to load entry bodies', url, e);
        return null;
      });
    cache.set(url, cached);
  }
  return cached;
}
