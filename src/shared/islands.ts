/**
 * Built-in island tag names. The markdown renderer (node) needs the bare
 * names without importing client components, so they live in shared.
 */
export const BUILTIN_ISLAND_NAMES = [
  'Giscus',
  'PasswordGate',
  'ZoomedImg',
  'Mermaid',
  'G2Plot',
  'ExpandableList',
] as const;

export type BuiltinIslandName = (typeof BUILTIN_ISLAND_NAMES)[number];

/**
 * Islands whose inner markdown is a titled entry list: `@@@ Title` lines
 * split the children at build time (see src/node/markdown/entries.ts), each
 * entry renders as its own markdown fragment, and the client island rebuilds
 * the list with search/sort/expand controls.
 */
export const ENTRY_LIST_ISLAND_NAMES = ['ExpandableList'] as const;

export type EntryListIslandName = (typeof ENTRY_LIST_ISLAND_NAMES)[number];

/** True when the island's children markdown is split into titled entries. */
export function isEntryListIsland(name: string): boolean {
  return (ENTRY_LIST_ISLAND_NAMES as readonly string[]).includes(name);
}
