// UnoCSS for the theme chrome; extracted into the bundle's css asset.
import 'virtual:uno.css';
import { initAnchorHighlight } from '../theme/anchor-highlight';
import { mountTheme } from '../theme/mount';

import '../styles/code.css'; // after theme.css so it wins ties (import order matters)
import '../styles/containers.css'; // after theme.css (full-card containers, M8)
import '../styles/content.css'; // after theme.css (list rhythm, tasklist accent, external arrow)
import '../styles/sidebar.css'; // after theme.css so it wins ties (import order matters)
import { initCodeTools } from './code-tools';
import { hydrateIslands, registerIslands } from './islands';
import { chromeUrlOf, ensureChrome, pagePayload } from './payload';
import { initLightbox } from './photoswipe';
import { initRouter } from './router';
import { initTabsPersistence } from './tabs';
import { initTerms } from './terms';

async function main(): Promise<void> {
  let payload = pagePayload();
  if (!payload) return;
  // Build payloads carry their locale's chrome (icons/navbar/sidebar) in a
  // shared module; it must be loaded and merged before any chrome mounts.
  // Dev keeps the data inline and skips this entirely.
  const chromeUrl = chromeUrlOf(payload, document.baseURI);
  if (chromeUrl !== null) {
    if (!(await ensureChrome(chromeUrl))) return;
    payload = pagePayload();
    if (!payload) return;
  }
  mountTheme(payload);
  registerIslands();
  hydrateIslands();
  initTabsPersistence();
  initAnchorHighlight();
  initLightbox();
  initCodeTools();
  initTerms();
  initRouter();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void main(), {
    once: true,
  });
} else {
  void main();
}
