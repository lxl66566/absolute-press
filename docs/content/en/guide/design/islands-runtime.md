---
date: 2026-10-08
category:
  - design
tag:
  - islands
  - solid
icon: solid/code
---

# Island Runtime Implementation

This page covers the full path of an island from a markdown tag to client-side hydration. It touches `src/shared/islands.ts` (the built-in list), `src/node/markdown/islands.ts` (scanning and pre-rendering), `src/client/runtime/` (registry and hydration), and `src/client/islands/` (built-in components). Usage-level documentation lives in the [Islands page of the guide](../islands.md); this page only covers the implementation.

## Pipeline overview

An island's lifecycle has four steps:

1. Build-time scan: `extractIslands` finds registered PascalCase tags in the source and replaces them with placeholder divs.
2. Build-time pre-render: the inner markdown is recursively rendered into HTML by the same renderer, producing `<div data-ap-island="Tag" data-props="...">inner HTML</div>`.
3. Page load: `entry.tsx` calls `registerIslands()` to install the component registry, then `hydrateIslands()`.
4. Client-side hydration: the placeholder div's innerHTML is passed to the component as `childrenHtml`, and the Solid component mounts onto that DOM node.

The rest of the body never enters the Solid render tree; components mount onto existing DOM nodes via `mountComponent`, with no SPA-style whole-page hydration reuse.

## Scan rules

`extractIslands` (`src/node/markdown/islands.ts`) is a single-pass character scan. Rules:

- The tag name must match `/^<([A-Z][A-Za-z0-9]*)/` and be in the registered list; unregistered PascalCase tags pass through as unknown HTML.
- On a hit, the whole span (open tag to close tag) is replaced with `<div data-ap-island-placeholder="i"></div>`. A div is chosen as the placeholder because it is a known html_block tag for markdown-it, which guarantees the placeholder is always a block-level token and passes through the renderer unchanged; after rendering, placeholders are swapped back to real island divs by index.
- Fenced code blocks and inline code spans are always skipped: the scanner first recognizes ` ``` `/`~~~` fences (at line start, 3 or more in a row) and inline code delimited by matching backtick runs; a `<Tag>` inside them is example text.
- The close-tag search is fence-aware too, and uses a depth counter to support nesting of same-named tags. An island can contain usage examples of itself in its own fenced code block without closing itself early.

Islands are block-level only; the tag owns its paragraph. The attribute parsing window is capped at 64KB; beyond that the scanner warns and leaves the tag as plain text — silent pass-through would leave the author with no clue.

## Props protocol

The attribute syntax follows Vue; implemented in `parseAttr`:

- Values with the `:x` prefix go through `JSON.parse`; failures are build errors (`invalid JSON value`). Values without a prefix are strings as-is.
- JSON prop keys are normalized to camelCase: `:box-data` corresponds to the `boxData` the component reads, and data-props carries the component-side name. String attributes are not normalized.
- Valueless attributes: a bare `flag` yields the string `"true"`; `:flag` yields boolean `true`.

On the serialization side is `renderIslandDiv`: the props JSON is attribute-escaped into `data-props`, and the rendered inner markdown becomes the div's innerHTML. The props the client receives are this JSON plus `childrenHtml` (below). Islands can nest inside an island's inner markdown — `renderFragment` recurses through the same extraction and rendering.

## Client-side hydration

The hydration core is `hydrateIslands` in `src/client/runtime/hydrate.ts`:

```ts
const childrenHtml = el.innerHTML;
el.innerHTML = '';
markMounted(el);
mountComponent(Comp, el, { ...props, childrenHtml } satisfies IslandProps);
```

Key points:

- The `data-ap-island-mounted` marker prevents double hydration. Whole-document calls (page load, route switch) and scoped calls (hydrating a subtree after ExpandableList rebuilds row DOM) share this marker.
- The pre-rendered innerHTML is read out as `childrenHtml` before being cleared; the component decides how to use it: PasswordGate restores it after unlock, ExpandableList parses it back into entries, components like Counter discard it.
- Unregistered names warn and skip; a `data-props` JSON parse failure also warns and continues with empty props.

## Registry and compile-time coverage check

The built-in island list lives in `BUILTIN_ISLAND_NAMES` in `src/shared/islands.ts`: the node-side renderer only needs tag names and cannot import client components, so the list lives in shared.

The client registry is in `src/client/runtime/islands.ts`; consistency between the list and the component map is enforced by one compile-time check:

```ts
const _coverageCheck: Record<(typeof BUILTIN_ISLAND_NAMES)[number], true> = {
  Giscus: true,
  // ...
};
```

Adding a name to the list without a component in the registry (or the reverse) fails tsc immediately, long before runtime.

Site islands are injected through the vite virtual module `virtual:absolute-press/islands`: the `load` hook in `src/node/build/plugin.ts` generates module code like `import I0 from "<module>"; export default { "Counter": I0 }` from `config.islands`, and `registerIslands()` merges the built-in and site maps and pushes them to the hydrate module via `setIslandRegistry`.

The dependency direction is deliberately one-way: `runtime/islands.ts` value-imports the components, `hydrate.ts` stays a leaf module, and components flow down through `setIslandRegistry` — island components themselves call `hydrateIslands` for subtree re-hydration, and a reverse import would close an ESM cycle. `registerIslands` must be called explicitly from `entry.tsx` rather than being a module side effect: `hydrateIslands` is only a re-export, and without the explicit call rolldown would tree-shake the whole module, turning every island into unknown.

## Lazy-loading tradeoffs

The component shells of Mermaid and G2Plot ship in the main bundle; the heavy dependencies are dynamic imports: `import('mermaid')` in `Mermaid.tsx` (mermaid includes elk; the chunk is large), `import('@antv/g2plot')` in `G2Plot.tsx`. Pages without the corresponding island never download these chunks; the cost is that the first chart render waits for one network fetch plus initialization. Mermaid fenced code blocks also count as an entry: the client-side `upgradeMermaidFences` upgrades such code blocks into Mermaid islands, and the build side skips line numbers, folding, and the toolbar for mermaid fences (`SPECIAL_FENCE_LANGS`) because the client rebuilds that part of the DOM.

## entryListIslands: site islands reusing the `@@@` entry pipeline

ExpandableList's `@@@` entry syntax is also useful for site-built lists, so the splitting pipeline is implemented as reusable. After a site adds an island name to the `entryListIslands` config, the check in `renderer.ts` gains one more source:

```ts
isEntryListIsland(spec.name) || entryListIslands.has(spec.name);
```

A matched island's children skip normal recursive rendering and go to `renderEntryListChildren` (`src/node/markdown/entries.ts`):

- `splitEntries` splits before markdown rendering and is fence-aware: `@@@ title` opens a new entry (`@@@@` and longer is content), the `@@ meta` line right after is that entry's meta, and everything before the first `@@@` is the preamble.
- Meta splits into columns on top-level `|` (`\|` escapes, `|` inside inline code does not split); each segment is inline-rendered via `renderFragmentInline` — block parsing never starts, so data strings like `">10h"` and `"#1"` stay literal.
- Each entry body renders independently through `renderFragment`; fragments share the slugger and link collection with the page, headings do not enter the TOC, and footnote ids are prefixed for isolation.
- The static output is an `.ap-xlist` table skeleton: a preamble block plus a table where each entry is a title row with meta cells followed by a full-width expandable body row. Without JS the whole table reads fully expanded.

The client component receives this skeleton through `childrenHtml`, parses it back into entries keyed by the `@@@` titles, fills meta from a TS data module into the matching rows, then re-hydrates nested islands in the body with the `hydrateIslands` exported from `absolute-press/client`. The typical scenario is a "TS data + md slot body" list page: meta columns come from a validatable data module, and markdown only holds body text. For the concrete config syntax and caveats, see the [corresponding guide section](../islands.md#reusing-the-entry-pipeline-for-site-islands-entrylist).
