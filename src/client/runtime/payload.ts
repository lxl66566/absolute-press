import type { PageChrome, PagePayload } from '../../shared/types';

/**
 * Chrome module of the current locale, loaded by ensureChrome() (build
 * payloads reference it via the `chrome` field; dev keeps chrome inline
 * and this stays null). Module state, not a window global: the runtime
 * owns the whole lifecycle.
 */
let currentChrome: { href: string; data: PageChrome } | null = null;

/**
 * Merge the loaded chrome into a parsed inline payload. A no-op while
 * nothing is loaded (dev) — build callers run ensureChrome() first, so
 * the data is already present by the time anything renders.
 */
export function mergeChrome(payload: PagePayload): PagePayload {
  if (currentChrome === null) return payload;
  return {
    ...payload,
    navbar: currentChrome.data.navbar,
    sidebar: currentChrome.data.sidebar,
    site: {
      ...payload.site,
      ...(currentChrome.data.icons !== undefined
        ? { icons: currentChrome.data.icons }
        : {}),
    },
  };
}

/**
 * Absolute URL of a payload's chrome reference resolved against a base —
 * the live document for the entry bootstrap, the navigation target for
 * soft navigations (the live document still sits on the source URL until
 * pushState). Null when the payload keeps its chrome inline (dev).
 */
export function chromeUrlOf(
  payload: PagePayload,
  baseUri: string,
): string | null {
  return payload.chrome === undefined
    ? null
    : new URL(payload.chrome, baseUri).href;
}

/**
 * Load the chrome module a payload references. Resolves without IO when
 * the current locale's module is already loaded; a locale crossing (soft
 * navigation) imports the target's module, which the shell's modulepreload
 * link has typically warmed already. Returns false when the module cannot
 * be loaded — callers degrade to the static page / native navigation.
 */
export async function ensureChrome(url: string): Promise<boolean> {
  if (currentChrome?.href === url) return true;
  try {
    const mod = (await import(/* @vite-ignore */ url)) as {
      default: PageChrome;
    };
    currentChrome = { href: url, data: mod.default };
    return true;
  } catch (e) {
    console.error('[absolute-press] failed to load chrome asset', url, e);
    return false;
  }
}

/**
 * Parse raw `__AP_DATA__` JSON into a payload, merging the loaded chrome
 * (see mergeChrome). Shared by the script-tag reader below and the client
 * router, which parses a fetched page's payload before swapping it in.
 */
export function parsePagePayload(json: string): PagePayload | null {
  try {
    return mergeChrome(JSON.parse(json) as PagePayload);
  } catch (e) {
    console.error('[absolute-press] failed to parse __AP_DATA__', e);
    return null;
  }
}

/**
 * Official reader for the page payload (`<script id="__AP_DATA__">`). Site
 * islands use it for locale/base/page metadata instead of parsing the
 * script tag themselves. Re-read on every call: the client router keeps
 * the script's contents in sync across soft navigations. Returns null on a
 * non-framework page or unparsable JSON (parse errors are logged).
 */
export function pagePayload(): PagePayload | null {
  const el = document.getElementById('__AP_DATA__');
  if (!el?.textContent) return null;
  return parsePagePayload(el.textContent);
}
