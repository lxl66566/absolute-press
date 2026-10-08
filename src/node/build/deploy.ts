/**
 * Cloudflare Pages `_headers` file. Emitted only when `deploy.cloudflare`
 * is on; dev has no counterpart (the entry chunk name is build-only
 * knowledge, and dev serves no immutable assets).
 */
export function renderCloudflareHeaders(scriptFile: string): string {
  const entry = scriptFile.startsWith('/') ? scriptFile : `/${scriptFile}`;
  return [
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
    // Only Cloudflare consumes this Link header (it promotes it to an Early
    // Hints response); other hosts ignore the whole file.
    '/',
    `  Link: <${entry}>; rel=modulepreload`,
    '',
  ].join('\n');
}
