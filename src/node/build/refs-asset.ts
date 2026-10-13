import { createHash } from 'node:crypto';

/**
 * One page's externalized term-ref definitions: `Record<term id, body html>`
 * covering the page's transitive term closure (terms nested inside ref
 * articles included). Ref bodies are full rendered articles — kilobytes each
 * — yet their popovers open only on demand, so the build ships them as a
 * content-hashed ES module instead of appending `<template
 * class="ap-term-def">` bodies to the document. Pages whose closures
 * serialize identically share one file (the name hashes the sorted,
 * serialized source); the client fetches it when a term first nears the
 * viewport and caches it across soft navigations (`/assets/*` immutable
 * rule). Dev keeps the templates inline and emits no such file.
 */
export function refsAsset(defs: Record<string, string>): {
  fileName: string;
  source: string;
} {
  // Key-sorted so page-visit order never forks the file name.
  const ordered = Object.fromEntries(
    Object.entries(defs).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  // JSON is a valid JS object literal, and as an external .js file it needs
  // no `</script>` escaping (only inline payloads do).
  const source = `export default ${JSON.stringify(ordered)};\n`;
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  return { fileName: `assets/refs-${hash}.js`, source };
}
