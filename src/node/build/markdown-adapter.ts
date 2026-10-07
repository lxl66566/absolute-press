/**
 * Adapter seam for the markdown pipeline (Agent A, src/node/markdown).
 * The build layer imports the renderer only through this module.
 *
 * Kept as a separate file so the integration point stays one line even if
 * the pipeline is still in flux; previously held a minimal inline stub.
 */
export { createMarkdownRenderer } from '../markdown/index.ts';
