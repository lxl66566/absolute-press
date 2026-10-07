import type { SidebarItem } from '../../shared/types';
import { isActiveRoute } from './links';

/** The `kind: 'group'` variant of SidebarItem. */
export type SidebarGroup = Extract<SidebarItem, { kind: 'group' }>;

/**
 * Stable collapse-state key for one group. Groups cannot be keyed by display
 * text alone (duplicate folder names are legal), so the index route anchors
 * the key; index-less folders fall back to their text under the parent key.
 */
export function groupKey(group: SidebarGroup, parentKey = ''): string {
  // Routes carry a leading slash, plain fallback text does not: normalize.
  const own = (group.link ?? group.text).replace(/^\//, '');
  return `${parentKey}/${own}`;
}

/** True when the group or any of its (deep) children matches the route. */
export function groupHasActive(group: SidebarGroup, route: string): boolean {
  // The folder row itself counts: a folder index being the current page
  // keeps the group on the active path (its row highlights either way).
  if (isGroupLinkActive(group, route)) return true;
  return group.children.some(child =>
    child.kind === 'link'
      ? isActiveRoute(child.link, route)
      : groupHasActive(child, route),
  );
}

/**
 * Keys of every group on the path to the active route (outermost first).
 * Pure so the auto-expand set is unit-testable.
 */
export function activeGroupKeys(
  items: SidebarItem[],
  route: string,
  parentKey = '',
): string[] {
  const keys: string[] = [];
  for (const item of items) {
    if (item.kind !== 'group') continue;
    const key = groupKey(item, parentKey);
    if (groupHasActive(item, route)) {
      keys.push(key);
      keys.push(...activeGroupKeys(item.children, route, key));
    }
  }
  return keys;
}

/** The folder row highlights when its index page is the current route. */
export function isGroupLinkActive(group: SidebarGroup, route: string): boolean {
  return group.link !== undefined && isActiveRoute(group.link, route);
}

/**
 * Every group key in the tree (depth-first, outermost first). The drawer's
 * collapse set needs the full key universe: it folds everything by default,
 * so "open" is derived by subtracting the active path from this list.
 */
export function allGroupKeys(items: SidebarItem[], parentKey = ''): string[] {
  const keys: string[] = [];
  for (const item of items) {
    if (item.kind !== 'group') continue;
    const key = groupKey(item, parentKey);
    keys.push(key);
    keys.push(...allGroupKeys(item.children, key));
  }
  return keys;
}
