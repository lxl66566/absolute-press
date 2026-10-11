/**
 * Cloudflare Pages / Netlify `_headers` file, emitted by default on every
 * build; other hosts serve it as an inert file. A site's own
 * `public/_headers` takes over (the caller skips the emit). Dev has no
 * counterpart: the entry chunk name is build-only knowledge.
 */
export function renderCloudflareHeaders(
  scriptFile: string,
  cssFiles: readonly string[],
  /**
   * Externalized chrome assets (see build/chrome-asset.ts), one per locale
   * in config order: the default locale (prefix '') rides the catch-all
   * `/*` rule — every page ships Early Hints, not just the root — and every
   * other locale gets its own prefix-scoped rule that overrides it (the
   * most specific matching rule wins per header), so its pages preload
   * their own chrome. An empty list (never in practice, kept for direct
   * callers) emits the Link line without a chrome entry.
   */
  chromeAssets: readonly { prefix: string; file: string }[] = [],
): string {
  const entry = scriptFile.startsWith('/') ? scriptFile : `/${scriptFile}`;
  /** One Link header value: entry + css preloads (+ this locale's chrome). */
  const linkLine = (chromeFile: string): string =>
    [
      `<${entry}>; rel=modulepreload`,
      ...cssFiles.map(
        css =>
          `<${css.startsWith('/') ? css : `/${css}`}>; rel=preload; as=style`,
      ),
      ...(chromeFile
        ? [
            `<${chromeFile.startsWith('/') ? chromeFile : `/${chromeFile}`}>; rel=modulepreload`,
          ]
        : []),
    ].join(', ');
  const rules: string[] = [
    // Client chunks and content images ship content-hashed names; katex
    // assets do not (fixed names), so the more specific rule below keeps
    // them on a short cache that survives a framework katex upgrade. CF
    // Pages applies the most specific matching path.
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/assets/katex/*',
    '  Cache-Control: public, max-age=86400',
    '',
  ];
  // Only Cloudflare consumes the Link header (it promotes it to an Early
  // Hints response on subsequent requests to the same URL); other hosts
  // ignore the whole file. The catch-all rule gives EVERY page Early Hints;
  // the locale prefix rules below override it where the chrome differs.
  const [fallback, ...locals] = chromeAssets;
  rules.push('/*', `  Link: ${linkLine(fallback?.file ?? '')}`, '');
  // Non-default locales live under their route prefix; a scoped rule keeps
  // their Early Hints from preloading another locale's chrome module.
  for (const { prefix, file } of locals) {
    if (prefix === '') continue;
    rules.push(`${prefix}/*`, `  Link: ${linkLine(file)}`, '');
  }
  return rules.join('\n');
}
