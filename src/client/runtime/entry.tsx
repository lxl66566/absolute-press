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
import { pagePayload } from './payload';
import { initLightbox } from './photoswipe';
import { initRouter } from './router';
import { initTabsPersistence } from './tabs';

function main(): void {
  const payload = pagePayload();
  if (!payload) return;
  mountTheme(payload);
  registerIslands();
  hydrateIslands();
  initTabsPersistence();
  initAnchorHighlight();
  initLightbox();
  initCodeTools();
  initRouter();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
