import { createHash } from 'node:crypto';

/**
 * One entry-list island's externalized bodies: `string[]` indexed by the
 * static table's row order (`data-ap-slot` markers point into it). Bodies
 * are full rendered markdown — kilobytes each, folded away until the row
 * expands — so lists past the config threshold ship them as a
 * content-hashed ES module instead of inflating the page HTML. The client
 * fetches the module when the island mounts (post-paint, cached across
 * soft navigations) and fills the slot rows. Dev keeps bodies inline and
 * emits no such file.
 */
export function xlistAsset(bodies: readonly string[]): {
  fileName: string;
  source: string;
} {
  // JSON is a valid JS array literal, and as an external .js file it needs
  // no `</script>` escaping (only inline payloads do).
  const source = `export default ${JSON.stringify(bodies)};\n`;
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  return { fileName: `assets/xlist-${hash}.js`, source };
}
