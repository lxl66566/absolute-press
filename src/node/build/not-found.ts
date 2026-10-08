import { messagesForLang } from '../../shared/i18n/index.ts';
import type { ResolvedConfig } from '../config.ts';
import { escapeHtml } from '../escape.ts';

// Fully inline: a 404 is served at whatever URL depth the visitor asked for,
// so relative asset URLs break and root-absolute ones would violate the
// subpath-deployment rule. Light/dark follow the OS via prefers-color-scheme
// (no localStorage theme to restore on an unknown URL); colors mirror the
// theme.css --c-* values.
const NOT_FOUND_CSS = [
  'body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;',
  'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
  'background:#ffffff;color:#20293a}',
  'main{text-align:center;padding:0 1.5rem;max-width:32rem}',
  '.code{font-size:3rem;font-weight:700;margin:0;opacity:.3}',
  'h1{font-size:1.25rem;margin:0.75rem 0}',
  'p{color:#5d6b7d;margin:0 0 1.5rem}',
  'a{color:#3eaf7c;text-decoration:none}',
  'a:hover{text-decoration:underline}',
  '@media (prefers-color-scheme:dark){',
  'body{background:#16181d;color:#dde2ea}',
  'p{color:#98a2b3}',
  'a{color:#46bd87}',
  '}',
].join('');

/**
 * Standalone `404.html` (CF Pages / GH Pages / nginx serve it for unknown
 * paths, fixing the soft-404 "200 + home page" response). Emitted in the
 * default locale; `noindex` keeps it out of search indexes. The home link
 * stays root-absolute (`/`): the build cannot know the deploy subpath
 * (documented limitation).
 */
/**
 * Route check for a content 404 override page (any locale prefix). The
 * fallback URL set is open-ended, so the override page itself is the only
 * 404-shaped URL a sitemap could advertise — keep it out.
 */
export function isNotFoundRoute(route: string): boolean {
  return route.split('/').pop() === '404';
}

export function renderNotFound(config: ResolvedConfig): string {
  // locales[0] is always the default locale (resolveConfig puts it first);
  // the fallback only satisfies noUncheckedIndexedAccess.
  const lang = config.locales[0]?.lang ?? 'zh-CN';
  const t = messagesForLang(lang).notFound;
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(lang)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="robots" content="noindex">',
    `<title>${escapeHtml(`${t.title} | ${config.title}`)}</title>`,
    `<style>${NOT_FOUND_CSS}</style>`,
    '</head>',
    '<body>',
    '<main>',
    '<p class="code">404</p>',
    `<h1>${escapeHtml(t.title)}</h1>`,
    `<p>${escapeHtml(t.message)}</p>`,
    `<a href="/">${escapeHtml(t.backHome)}</a>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
