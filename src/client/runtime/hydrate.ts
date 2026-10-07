import type { Component } from 'solid-js';

import { mountComponent } from '../dom';

/**
 * Cycle-free island hydration core. Islands that re-hydrate rebuilt DOM
 * (ExpandableList rows, PasswordGate unlocked content) import hydrateIslands
 * from here instead of from runtime/islands.ts — that module value-imports
 * the island components, so hydration reaching back up would close an ESM
 * cycle. The registry flows one way instead: runtime/islands.ts merges
 * builtins + site islands at init and pushes the map down via
 * setIslandRegistry; islands/* -> hydrate.ts is always a forward edge.
 */

/**
 * Props passed to every island: the parsed `data-props` JSON plus
 * `childrenHtml`, the placeholder's pre-rendered inner HTML.
 */
export interface IslandProps {
  childrenHtml?: string;
  [key: string]: unknown;
}

export type IslandComponent = Component<IslandProps>;

/** Full island map (builtins + site islands), installed by runtime/islands. */
let registry: Record<string, IslandComponent> = {};

/** Install the merged island map; called once by runtime/islands.ts init. */
export function setIslandRegistry(map: Record<string, IslandComponent>): void {
  registry = map;
}

export function islandRegistry(): Record<string, IslandComponent> {
  return registry;
}

/** Placeholder marker: hydration already happened for this element. */
function markMounted(el: HTMLElement): void {
  el.dataset.apIslandMounted = '1';
}

/**
 * Hydrate `[data-ap-island]` placeholders under `root` with registered
 * components. Scoped calls (ExpandableList re-hydrating its rebuilt item
 * DOM) and the document-wide call share the mounted marker, so an element is
 * never hydrated twice.
 */
export function hydrateIslands(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-ap-island]')) {
    if (el.dataset.apIslandMounted === '1') continue;
    const name = el.dataset.apIsland ?? '';
    const Comp = registry[name];
    if (!Comp) {
      console.warn(`[absolute-press] unknown island: ${name}`);
      continue;
    }
    let props: Record<string, unknown> = {};
    try {
      props = JSON.parse(el.dataset.props ?? '{}') as Record<string, unknown>;
    } catch {
      console.warn(`[absolute-press] invalid data-props on island: ${name}`);
    }
    // Pre-rendered placeholder HTML survives as childrenHtml.
    const childrenHtml = el.innerHTML;
    el.innerHTML = '';
    markMounted(el);
    mountComponent(Comp, el, { ...props, childrenHtml } satisfies IslandProps);
  }
}
