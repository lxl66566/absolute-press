import { createEffect, createSignal } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import {
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_VIEWPORT_CAP_RATIO,
  SIDEBAR_WIDTH_CSS_VAR,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '../../shared/prefs';
import type { PagePayload } from '../../shared/types';
import { FOLD_SETTLE_MS } from './constants';
import { useMessages } from './i18n';
import { activeGroupKeys } from './sidebar-tree';
import { SidebarTree } from './SidebarTreeRow';
import { clientRoute } from './state';

const GROUPS_STORAGE_KEY = 'ap-sidebar-groups';

function clampWidth(px: number): number {
  const cap = Math.min(
    SIDEBAR_MAX_WIDTH_PX,
    window.innerWidth * SIDEBAR_VIEWPORT_CAP_RATIO,
  );
  return Math.round(Math.min(Math.max(px, SIDEBAR_MIN_WIDTH_PX), cap));
}

/** The rail's rendered width (min() resolved) — keyboard-step base. */
function currentWidth(): number {
  const rail = document.getElementById('ap-sidebar');
  const width = rail?.getBoundingClientRect().width;
  return width !== undefined && width > 0 ? width : 288;
}

function applyWidth(px: number): void {
  document.documentElement.style.setProperty(SIDEBAR_WIDTH_CSS_VAR, `${px}px`);
}

function saveWidth(px: number): void {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(px));
  } catch {
    // storage unavailable — width stays session-only
  }
}

function resetWidth(): void {
  try {
    localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
  } catch {
    // storage unavailable — the inline override still clears below
  }
  document.documentElement.style.removeProperty(SIDEBAR_WIDTH_CSS_VAR);
}

/**
 * Storage schema (stable since the Record days): `ap-sidebar-groups` maps
 * group keys to `true` (collapsed). Absent or `false` = expanded. The
 * in-memory container is a Set of collapsed keys, serialized back into the
 * same Record shape so existing users' folds survive the refactor.
 */
function loadCollapsed(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      return new Set();
    const keys = new Set<string>();
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true) keys.add(key);
    }
    return keys;
  } catch {
    return new Set();
  }
}

function saveCollapsed(keys: ReadonlySet<string>): void {
  const map: Record<string, boolean> = {};
  for (const key of keys) map[key] = true;
  try {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — collapse state stays session-only
  }
}

function onResizeMove(ev: PointerEvent): void {
  applyWidth(clampWidth(ev.clientX));
}

function onResizePointerDown(e: PointerEvent): void {
  e.preventDefault();
  const handle = e.currentTarget as HTMLElement;
  // Capture keeps fast drags tracked when the pointer leaves the 5px strip
  // (an inactive/synthetic pointer throws — the strip's own listeners still
  // cover it).
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // capture unavailable — drag stays accurate while over the strip
  }
  document.body.classList.add('ap-sidebar-resizing');
  const end = (ev: PointerEvent): void => {
    handle.removeEventListener('pointermove', onResizeMove);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    document.body.classList.remove('ap-sidebar-resizing');
    if (ev.type !== 'pointercancel') {
      const px = clampWidth(ev.clientX);
      applyWidth(px);
      saveWidth(px);
    }
  };
  handle.addEventListener('pointermove', onResizeMove);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

function onResizeKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const step = e.key === 'ArrowLeft' ? -16 : 16;
  const px = clampWidth(currentWidth() + step);
  applyWidth(px);
  saveWidth(px);
}

/**
 * Desktop rail resizer: a viewport-fixed strip hugging the rail's right
 * border (the rail is position:fixed with transform:none at lg+, so a fixed
 * child tracks the true edge and stays clear of the rail's thin scrollbar).
 * Drag writes `--ap-sidebar-w` on <html> live and persists the px value on
 * release; arrow keys step by 1rem; double-click clears back to the
 * stylesheet default. Hidden below lg — the mobile drawer keeps its own
 * width. Pre-paint restore lives in the shell's FOUC script.
 */
function SidebarResizer(props: { label: string }): SolidElement {
  return (
    <div
      class="ap-sidebar-resizer hidden lg:block"
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      title={props.label}
      tabindex="0"
      onPointerDown={onResizePointerDown}
      onKeyDown={onResizeKeyDown}
      onDblClick={resetWidth}
    />
  );
}

export function SideBar(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  // Collapsed group keys (see groupKey); absent = expanded. The tree is
  // infinitely nested — every level toggles the same way.
  const [collapsedKeys, setCollapsedKeys] =
    createSignal<ReadonlySet<string>>(loadCollapsed());

  const toggleGroup = (key: string): void => {
    setCollapsedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed(next);
      return next;
    });
  };

  // Auto-expand the active path once per load / navigation. Deliberately NOT
  // part of the open computation: deriving "open" from groupHasActive forced
  // groups containing the current page open on every render, so clicking the
  // chevron never visibly collapsed them. This effect only reruns when the
  // route changes, hence a manual collapse always sticks until navigating.
  createEffect(
    () => clientRoute(),
    current => {
      const keys = activeGroupKeys(props.payload.sidebar, current);
      setCollapsedKeys(prev => {
        if (!keys.some(key => prev.has(key))) return prev;
        const next = new Set(prev);
        for (const key of keys) next.delete(key);
        saveCollapsed(next);
        return next;
      });
    },
  );

  // Locate the current article row once per load / navigation (H1): the
  // effect above re-opens its ancestors and the group animation runs
  // 160ms, so wait for it to settle, then pin the row to the rail's top
  // edge — its subitems below stay visible too. A fully visible row leaves
  // the reader's scroll position untouched. One shot per route —
  // afterwards the reader owns the rail's scroll position.
  createEffect(
    () => clientRoute(),
    () => {
      window.setTimeout(() => {
        const rail = document.getElementById('ap-sidebar');
        const active = rail?.querySelector('a[aria-current="page"]');
        if (!rail || !active) return;
        // Desktop-only surface: below lg the rail is off-canvas (mobile
        // navigation is the drawer), so there is nothing to reveal.
        if (window.innerWidth < 1024) return;
        const railBox = rail.getBoundingClientRect();
        const box = active.getBoundingClientRect();
        if (box.top >= railBox.top && box.bottom <= railBox.bottom) return;
        active.scrollIntoView({ block: 'start', inline: 'nearest' });
      }, FOLD_SETTLE_MS);
    },
  );

  return (
    <>
      <nav class="text-sm">
        <ul class="ap-sidebar-tree">
          <SidebarTree
            items={props.payload.sidebar}
            collapsed={collapsedKeys}
            toggle={toggleGroup}
            msg={t}
            icons={props.payload.site.icons}
          />
        </ul>
      </nav>
      <SidebarResizer label={t.sidebar.resizeWidth} />
    </>
  );
}
