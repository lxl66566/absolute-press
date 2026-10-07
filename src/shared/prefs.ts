/**
 * Persisted UI preferences shared by the build-time shell (the inline FOUC
 * bootstrap script) and the client theme (read + write): storage keys, the
 * sidebar width clamp and the CSS variable must agree across both contexts,
 * so they live here as the single source.
 */

/** localStorage key holding the resolved theme (`'light' | 'dark'`). */
export const THEME_STORAGE_KEY = 'ap-theme';

/** localStorage key holding the persisted desktop sidebar width (px). */
export const SIDEBAR_WIDTH_STORAGE_KEY = 'ap-sidebar-w';

/**
 * CSS variable the sidebar width applies to (inline style on <html>; the
 * stylesheet resolves it with a fallback default).
 */
export const SIDEBAR_WIDTH_CSS_VAR = '--ap-sidebar-w';

/** Sidebar drag clamp lower bound (13rem): long folder titles stay usable. */
export const SIDEBAR_MIN_WIDTH_PX = 208;

/** Sidebar drag clamp upper bound (36rem): the rail stays a rail. */
export const SIDEBAR_MAX_WIDTH_PX = 576;

/**
 * Viewport share capping the sidebar width (half the viewport outranks the
 * min/max clamp so the content lane never starves).
 */
export const SIDEBAR_VIEWPORT_CAP_RATIO = 0.5;

/**
 * Pre-paint preference restore, inlined at the top of <head> before any
 * stylesheet: resolves the theme (saved value, else prefers-color-scheme)
 * into html[data-theme] and restores the saved sidebar width clamp into
 * --ap-sidebar-w, so first paint already matches the saved preferences.
 */
export function foucScript(): string {
  // `innerWidth*.5` (not `*0.5`) keeps the emitted script byte-identical to
  // the pre-refactor literal; same value as SIDEBAR_VIEWPORT_CAP_RATIO.
  return (
    `!function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");` +
    `if(t!=="dark"&&t!=="light"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}` +
    `document.documentElement.dataset.theme=t;` +
    `var w=parseInt(localStorage.getItem("${SIDEBAR_WIDTH_STORAGE_KEY}"),10);` +
    `if(w){w=Math.min(Math.max(w,${SIDEBAR_MIN_WIDTH_PX}),Math.min(${SIDEBAR_MAX_WIDTH_PX},innerWidth*.5));` +
    `document.documentElement.style.setProperty("${SIDEBAR_WIDTH_CSS_VAR}",w+"px")}}catch(e){}}()`
  );
}
