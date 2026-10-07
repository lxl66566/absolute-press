import { createEffect, createRoot, createSignal } from 'solid-js';

import { THEME_STORAGE_KEY } from '../../shared/prefs';
import { pagePayload } from '../runtime/payload';

/**
 * Module-level client state shared across the separately mounted chrome
 * roots (nav / sidebar / toc / content are distinct Solid roots but share
 * one bundle, so module signals act as the store).
 */

export type ThemeName = 'light' | 'dark';

const hasDOM = typeof document !== 'undefined';

/**
 * The current page route. mountTheme seeds it; the runtime router updates
 * it on client-side navigation. Navbar section highlights and the sidebar's
 * active row read it reactively, so the persistent chrome tracks the route
 * without being remounted between pages.
 */
const [clientRoute, setClientRoute] = createSignal('');

/**
 * The current page's asset/link base ('' or '../'...). Every payload builds
 * its links page-relative, so the persistent chrome rewrites its hrefs
 * through this signal whenever the router lands on a page of another depth.
 */
function detectInitialBase(): string {
  // Seed from the page payload (like detectInitialTheme seeds from
  // data-theme): the payload script tag precedes the deferred bundle, so
  // this runs before mountTheme. A plain '' initial value made the first
  // synchronous chrome render resolve root-absolute assets (the navbar /
  // drawer logo imgs) page-relative — a 404 request flash on every
  // subpage before the mount-time write landed and re-rendered.
  if (!hasDOM) return '';
  return pagePayload()?.site.base ?? '';
}

const [clientBase, setClientBase] = createSignal(detectInitialBase());

export { clientBase, clientRoute, setClientBase, setClientRoute };

function detectInitialTheme(): ThemeName {
  // The shell inline script sets data-theme before hydration; trust it first.
  const current = document.documentElement.dataset.theme;
  if (current === 'dark' || current === 'light') return current;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // storage unavailable (private mode) — fall through to media query
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

const [theme, setTheme] = createSignal<ThemeName>(
  hasDOM ? detectInitialTheme() : 'light',
);

if (hasDOM) {
  // App-lifetime sync root: html[data-theme] + localStorage.
  createRoot(() => {
    createEffect(
      () => theme(),
      value => {
        document.documentElement.dataset.theme = value;
        try {
          localStorage.setItem(THEME_STORAGE_KEY, value);
        } catch {
          // storage unavailable — theme still applies for this session
        }
      },
    );
  });
}

export { theme };

export function toggleTheme(): void {
  setTheme(t => (t === 'dark' ? 'light' : 'dark'));
}

/**
 * Mobile drawer state (H6). The drawer chrome lives in the nav chunk
 * (ThemeNav renders MobileDrawer); the #ap-sidebar tree is the desktop-only
 * rail (mobile navigation is the drawer, per the AGENTS ruling).
 */
const [drawerOpen, setDrawerOpen] = createSignal(false);

export { drawerOpen };

export function openDrawer(): void {
  setDrawerOpen(true);
}

export function closeDrawer(): void {
  setDrawerOpen(false);
}

export function toggleDrawer(): void {
  setDrawerOpen(open => !open);
}

/**
 * Whether this page's password gate is unlocked. Set by the PasswordGate
 * island (session-remembered unlocks included); the Toc chrome reads it to
 * keep encrypted headings out of the "on this page" list until unlock.
 */
const [gateUnlocked, setGateUnlocked] = createSignal(false);

export { gateUnlocked, setGateUnlocked };
