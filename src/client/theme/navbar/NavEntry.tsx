import { createEffect, createSignal, For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { navLinkOf, type NavItem } from '../../../shared/types';
import { cx } from '../cx';
import { FaIcon } from '../FaIcon';
import { ChevronDownIcon } from '../icons';
import { isActiveRoute, isExternalHref, withBase } from '../links';
import { clientRoute } from '../state';
import { dropCaptionClass, dropLinkClass, topLinkClass } from './classes';
import { nestedMaxWidth, placeNestedFlyout, placeTopFlyout } from './placement';
import { menuEpoch, pinnedKey, setMenuEpoch, setPinnedKey } from './state';

/**
 * M3 dropdown slimming: subdirectories move to the front of their panel.
 * Folder-overview rows (板块总览行) stay pinned above them: the overview is
 * the panel's entry point, not a regular leaf to shuffle. Panel size itself
 * is handled by the half-viewport cap with internal scrolling, so direct
 * article links always stay reachable.
 */
export function slimNavItem(item: NavItem): NavItem {
  if (item.kind === 'leaf') return item;
  const children = item.children;
  if (!children.length || children.some(c => c.kind === 'header')) return item;
  const overview = children.filter(c => c.kind === 'leaf' && c.index);
  const rest = children.filter(c => !(c.kind === 'leaf' && c.index));
  const folders = rest.filter(c => c.kind === 'folder');
  const leaves = rest.filter(c => c.kind !== 'folder');
  return { ...item, children: [...overview, ...folders, ...leaves] };
}

/** Decoded path for tolerant comparison (encoded CJK segments). */
function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * First path segment of a site route: `/coding/a` -> `/coding`. A
 * single-segment path is its own section (root pages match exactly).
 */
function sectionOf(path: string): string {
  const decoded = decodePath(path);
  const segs = decoded.split('/').filter(Boolean);
  if (segs.length <= 1) return decoded;
  return `/${segs[0]}`;
}

/**
 * M1 section highlight: a top-level item stays active across its whole
 * subtree (old-theme behavior). Navbar groups carry no link, so the section
 * is inferred from the descendant links' first path segment — this keeps
 * working when a huge panel was slimmed to folder rows (M3).
 */
function isSectionActive(item: NavItem, route: string): boolean {
  const target = sectionOf(route);
  const self = navLinkOf(item);
  if (self !== undefined) return sectionOf(self) === target;
  const found: boolean[] = [];
  const walk = (node: NavItem): void => {
    if (node.kind === 'leaf') return;
    for (const child of node.children) {
      const link = navLinkOf(child);
      if (link !== undefined && !isExternalHref(link))
        found.push(sectionOf(link) === target);
      walk(child);
    }
  };
  walk(item);
  return found.some(Boolean);
}

export function itemHref(base: string, link: string): string {
  return isExternalHref(link) ? link : withBase(base, link);
}

/** Row click navigates: menus must not outlive the visit. */
const closeMenus = (): void => {
  setPinnedKey(null);
  setMenuEpoch(e => e + 1);
};

/**
 * One navbar entry; nests recursively for `children` (flyout on sublevels).
 * Nested flyouts place themselves with JS (fixed positioning) on open so the
 * capped, scrollable parent panel cannot clip them.
 */
export function NavEntry(props: {
  item: NavItem;
  base: string;
  nested: boolean;
  /** Ancestor menu key; leaf name appends to it for the pin state. */
  parentKey?: string;
  icons?: Record<string, string>;
}): SolidElement {
  const item = props.item;
  // Folders/headers own the panel; leaves are bare links.
  const hasChildren = item.kind !== 'leaf' && item.children.length > 0;
  const link = navLinkOf(item);
  // Top level uses the section prefix match (M1); nested rows stay exact.
  const active = () =>
    props.nested
      ? link !== undefined && isActiveRoute(link, clientRoute())
      : isSectionActive(item, clientRoute());
  const external = link !== undefined && isExternalHref(link);
  const menuKey = `${props.parentKey ?? ''}/${link ?? item.text}`;
  let liEl: HTMLLIElement | undefined;
  let flyEl: HTMLUListElement | undefined;
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  // The effect below needs the li as a reactive value: a plain-let getter is
  // read before the JSX (and its refs) exist and never re-runs.
  const [liNode, setLiNode] = createSignal<HTMLLIElement>();
  const open = () => hovered() || focused() || pinnedKey() === menuKey;

  /**
   * Place this entry's panel. Panels are `position: fixed` from the start
   * (never contribute static-position overflow to a scrollable ancestor —
   * the H8 horizontal-scrollbar bug); coordinates are header-relative
   * because the fixed header's backdrop-filter makes the header the
   * containing block for fixed descendants. The geometry itself lives in
   * placement.ts (pure, unit-tested); this shell only measures and writes.
   */
  const placeFlyout = (): void => {
    if (!liEl || !flyEl) return;
    const headerBox = liEl.closest('header')?.getBoundingClientRect();
    const li = liEl.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    // Measure the natural size with any previous clamp removed.
    flyEl.style.maxHeight = '';
    flyEl.style.maxWidth = '';
    if (props.nested) {
      // The width clamp must land before measuring: it changes how rows
      // wrap and thus the panel's natural height.
      flyEl.style.maxWidth = `${nestedMaxWidth(viewW, li.right)}px`;
      const fly = flyEl.getBoundingClientRect();
      const placed = placeNestedFlyout({
        viewport: { width: viewW, height: viewH },
        anchor: { top: li.top, right: li.right },
        panel: { height: fly.height },
        navBottom: headerBox?.bottom ?? 0,
      });
      flyEl.style.left = `${placed.left - (headerBox?.left ?? 0)}px`;
      flyEl.style.top = `${placed.top - (headerBox?.top ?? 0)}px`;
      flyEl.style.maxHeight = `${placed.maxHeight}px`;
      return;
    }
    const fly = flyEl.getBoundingClientRect();
    const left = placeTopFlyout({
      viewport: { width: viewW },
      anchor: { left: li.left },
      panel: { width: fly.width },
    });
    flyEl.style.left = `${left - (headerBox?.left ?? 0)}px`;
  };

  const togglePin = (e: MouseEvent): void => {
    // Click-focus would hold the panel open via focusin; the pin (or hover)
    // owns the open state instead.
    (e.currentTarget as HTMLElement).blur();
    setPinnedKey(current => (current === menuKey ? null : menuKey));
  };

  const enter = (): void => {
    // Pinned menus follow the pointer (menu-bar mode): the single open
    // panel moves to the hovered entry instead of duplicating.
    if (pinnedKey() !== null && pinnedKey() !== menuKey) setPinnedKey(menuKey);
    setHovered(true);
  };
  const leave = (): void => {
    setHovered(false);
  };
  const focusIn = (): void => {
    setFocused(true);
  };

  createEffect(
    () => liNode(),
    li => {
      if (!li) return;
      const focusOut = (e: FocusEvent): void => {
        const target = e.relatedTarget;
        if (!(target instanceof Node) || !li.contains(target))
          setFocused(false);
      };
      li.addEventListener('pointerenter', enter);
      li.addEventListener('pointerleave', leave);
      li.addEventListener('focusin', focusIn);
      li.addEventListener('focusout', focusOut);
      return () => {
        li.removeEventListener('pointerenter', enter);
        li.removeEventListener('pointerleave', leave);
        li.removeEventListener('focusin', focusIn);
        li.removeEventListener('focusout', focusOut);
        setHovered(false);
        setFocused(false);
      };
    },
  );

  // Placement runs while the panel is visible; the fixed panel follows
  // parent-panel scrolling and viewport changes. The returned cleanup runs
  // both on close and when the owner is disposed mid-open — otherwise the
  // window listener outlives the entry.
  createEffect(
    () => open(),
    isOpen => {
      if (!isOpen) return;
      placeFlyout();
      const panel = liEl?.closest('.ap-nav-drop');
      panel?.addEventListener('scroll', placeFlyout, { passive: true });
      window.addEventListener('resize', placeFlyout);
      return () => {
        panel?.removeEventListener('scroll', placeFlyout);
        window.removeEventListener('resize', placeFlyout);
      };
    },
  );
  // Epoch bumps (row click, client-side navigation) drop this entry's
  // hover/focus so no panel survives into the page it navigated away to.
  createEffect(
    () => menuEpoch(),
    () => {
      setHovered(false);
      setFocused(false);
    },
  );
  const label = (
    <>
      <Show when={item.kind === 'header' ? undefined : item.icon}>
        {icon => (
          // mr-0.5: full-bleed FA glyphs need a touch more ink clearance
          // than the 2px top-level gap provides.
          <FaIcon name={icon()} icons={props.icons} class="mr-0.5 opacity-80" />
        )}
      </Show>
      {/* Panel rows (H8): single line with ellipsis — a wrapped row was half
          of the original horizontal-scrollbar bug, and panels cap at 20rem.
          The title keeps long titles reachable; top-level items never wrap
          anyway (whitespace-nowrap on the row class). */}
      <span
        class={props.nested ? 'truncate' : undefined}
        title={props.nested ? item.text : undefined}
      >
        {item.text}
      </span>
      <Show when={hasChildren}>
        {/* Top level: points down, flips up while open. Nested rows: points
            right while closed, down while open. */}
        <ChevronDownIcon
          class={cx(
            'size-3.5 shrink-0 opacity-60 transition-transform duration-150',
            props.nested
              ? cx('ml-auto', !open() && '-rotate-90')
              : open() && 'rotate-180',
          )}
        />
      </Show>
    </>
  );
  const rowClass = () =>
    cx(
      props.nested ? dropLinkClass : topLinkClass,
      active() && (props.nested ? 'ap-nav-drop-active' : 'ap-nav-top-active'),
    );
  return (
    // Named groups keep nested flyouts from reopening ancestor dropdowns;
    // ap-nav-item scopes the click-outside pin release.
    <li
      ref={el => {
        liEl = el;
        setLiNode(el);
      }}
      class={
        props.nested
          ? cx(
              'ap-nav-item group/sub relative',
              // Folder-overview row (板块总览行): presentation (badge,
              // divider) is site CSS keyed on this hook.
              item.kind === 'leaf' && item.index && 'ap-nav-index-row',
            )
          : 'ap-nav-item group relative'
      }
    >
      <Show
        when={link}
        fallback={
          <button type="button" class={rowClass()} onClick={togglePin}>
            {label}
          </button>
        }
      >
        {href => (
          <a
            href={itemHref(props.base, href())}
            class={rowClass()}
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer' : undefined}
            onClick={closeMenus}
          >
            {label}
          </a>
        )}
      </Show>
      <Show when={hasChildren}>
        <NavDropPanel
          item={item}
          base={props.base}
          nested={props.nested}
          parentKey={menuKey}
          open={open}
          icons={props.icons}
          flyRef={el => {
            flyEl = el;
          }}
        />
      </Show>
    </li>
  );
}

/**
 * One dropdown panel (flyout). Both levels are `position: fixed`: top-level
 * panels hang from the header's bottom edge (CSS top-full) and shift left
 * near the viewport's right edge, nested ones are placed by JS. Fixed keeps
 * every panel out of flow (no overflow contribution) and both size to their
 * longest row (H8: no more two-line wraps from the anchor width) with a
 * viewport-safe cap.
 */
function NavDropPanel(props: {
  item: NavItem;
  base: string;
  nested: boolean;
  parentKey?: string;
  open?: () => boolean;
  icons?: Record<string, string>;
  flyRef?: (el: HTMLUListElement) => void;
}): SolidElement {
  // Top-level panels lead with a build-generated overview row (NavItem.index,
  // pinned by slimNavItem). Nested index-linked folders get the same entry
  // point synthesized at render time: the folder row itself is only the
  // expand toggle — the overview link belongs inside the panel it opens.
  // Frontmatter `overview: false` (payload folder marker) opts out.
  const children = (): NavItem[] => {
    if (props.item.kind === 'leaf') return [];
    if (
      props.nested &&
      props.item.kind === 'folder' &&
      props.item.link !== undefined &&
      props.item.overview !== false
    ) {
      const overview: NavItem = {
        kind: 'leaf',
        text: props.item.text,
        link: props.item.link,
        icon: props.item.icon,
        index: true,
      };
      return [overview, ...props.item.children];
    }
    return props.item.children;
  };
  return (
    <ul
      ref={el => props.flyRef?.(el)}
      class={cx(
        // ap-nav-drop caps the panel below the navbar; nested flyouts
        // get their live position and clamp from placeFlyout(). Open and
        // close are class-driven (is-open snaps in, close fades out) so
        // pointer switches between entries never blank the panel.
        'ap-nav-drop invisible z-50 min-w-44 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-1.5 opacity-0 shadow-[var(--c-shadow)] transition duration-150 ease-out',
        props.nested ? 'fixed' : 'fixed left-0 top-full',
        props.open?.() && 'is-open',
      )}
    >
      <For each={children()}>
        {child =>
          child.kind === 'header' ? (
            // Configured group caption: static label, children inlined
            // below it in the same panel (老站 dropdown grouping).
            <li class="ap-nav-caption">
              <span class={dropCaptionClass}>{child.text}</span>
              <ul>
                <For each={child.children}>
                  {grandchild => (
                    <NavEntry
                      item={grandchild}
                      base={props.base}
                      nested
                      parentKey={props.parentKey}
                      icons={props.icons}
                    />
                  )}
                </For>
              </ul>
            </li>
          ) : (
            <NavEntry
              item={child}
              base={props.base}
              nested
              parentKey={props.parentKey}
              icons={props.icons}
            />
          )
        }
      </For>
    </ul>
  );
}
