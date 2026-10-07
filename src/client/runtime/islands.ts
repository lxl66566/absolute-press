import siteIslands from 'virtual:absolute-press/islands';

import { BUILTIN_ISLAND_NAMES } from '../../shared/islands';
import {
  ExpandableList,
  G2Plot,
  Giscus,
  Mermaid,
  PasswordGate,
  ZoomedImg,
} from '../islands';
import { setIslandRegistry, type IslandComponent } from './hydrate';

/**
 * Framework built-in islands; keep in sync with BUILTIN_ISLAND_NAMES
 * (src/shared/islands.ts). Sites add their own via config `islands`.
 */
export const builtinIslands: Record<string, IslandComponent> = {
  Giscus,
  PasswordGate,
  ZoomedImg,
  Mermaid,
  G2Plot,
  ExpandableList,
};

// Compile-time guard: registry covers exactly the declared builtin names.
const _coverageCheck: Record<(typeof BUILTIN_ISLAND_NAMES)[number], true> = {
  Giscus: true,
  PasswordGate: true,
  ZoomedImg: true,
  Mermaid: true,
  G2Plot: true,
  ExpandableList: true,
};
void _coverageCheck;

// Dependency inversion: this module value-imports the island components, so
// hydration must not import back from here (that was an ESM cycle, dodged
// only by lazy registry evaluation). Instead the merged map flows down into
// the leaf hydrate module. Entry and router keep importing hydrateIslands
// from this module, which both re-exports it and keeps the registration in
// every bundle that can hydrate.
//
// The install is a function entry.tsx calls explicitly, NOT a module-init
// side effect: hydrateIslands is a pure re-export from ./hydrate, so with
// nothing else consuming this module rolldown drops the whole module —
// components and init call alike — and every island hydrates as "unknown".
export function registerIslands(): void {
  setIslandRegistry({ ...builtinIslands, ...siteIslands });
}

export { hydrateIslands, islandRegistry } from './hydrate';
export type { IslandComponent, IslandProps } from './hydrate';
