import type { PageChrome, PagePayload } from '../../shared/types';

/**
 * Chrome module of the current locale, loaded by loadChrome() and installed
 * by commitChrome() (build payloads reference it via the `chrome` field; dev
 * keeps chrome inline and this stays null). Module state, not a window
 * global: the runtime owns the whole lifecycle.
 */
let currentChrome: { href: string; data: PageChrome } | null = null;

/**
 * Merge the loaded chrome into a parsed inline payload. A no-op while
 * nothing is loaded (dev) — build callers run loadChrome()+commitChrome()
 * first, so the data is already present by the time anything renders.
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
 * Load the chrome module a payload references WITHOUT committing it: the
 * module data returns to the caller, which decides when it becomes the
 * current chrome (commitChrome). The router must not commit before its seq
 * check — a superseded navigation's late-resolving import would otherwise
 * overwrite the chrome a newer navigation committed, and pagePayload() would
 * merge a stale locale's navbar/sidebar into the live page until the next
 * navigation. Resolves null when the module cannot be loaded — callers
 * degrade to the static page / native navigation.
 */
export async function loadChrome(url: string): Promise<PageChrome | null> {
  try {
    const mod = (await import(/* @vite-ignore */ url)) as {
      default: PageChrome;
    };
    return mod.default;
  } catch (e) {
    console.error('[absolute-press] failed to load chrome asset', url, e);
    return null;
  }
}

/**
 * Install a loaded chrome module as the current one (mergeChrome and
 * pagePayload() read it from here on).
 */
export function commitChrome(url: string, data: PageChrome): void {
  currentChrome = { href: url, data };
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
