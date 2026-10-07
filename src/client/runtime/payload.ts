import type { PagePayload } from '../../shared/types';

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
  try {
    return JSON.parse(el.textContent) as PagePayload;
  } catch (e) {
    console.error('[absolute-press] failed to parse __AP_DATA__', e);
    return null;
  }
}
