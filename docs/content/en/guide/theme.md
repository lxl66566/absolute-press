---
date: 2026-10-03
category:
  - guide
tag:
  - theme
  - css
icon: solid/palette
---

# Theme Customization

The theme chrome is a set of Solid components mounted onto placeholder DOM: `#ap-nav` (navbar), `#ap-sidebar` (sidebar), `#ap-toc` (table of contents), `#ap-content` (content container). Visual customization goes through CSS variables; no component changes needed.

## Design tokens --c-*

`src/client/styles/theme.css` defines light and dark token sets: light in `:root`, dark in `html[data-theme='dark']`. Custom islands, site-level components, and injected styles read only these variables, so anything rendered anywhere on the page picks up both light and dark values automatically:

| Variable      | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| `--c-accent`  | Accent color: links, active states, hover                   |
| `--c-bg`      | Page and component background                               |
| `--c-bg-soft` | One level softer: toolbars, table headers, collapsed blocks |
| `--c-bg-mute` | Softest level: disabled fills, scrollbars, progress tracks  |
| `--c-text`    | Primary text                                                |
| `--c-text-2`  | Secondary text: helper copy, meta, grayscale icons          |
| `--c-border`  | Borders and dividers                                        |
| `--c-code-bg` | Inline code and code block background                       |
| `--c-shadow`  | Card/figure shadow (full `box-shadow` value)                |

There are also layout size tokens `--ap-nav-h` / `--ap-sidebar-w` / `--ap-toc-w` / `--ap-footer-h`, plus two component-level tokens: `--ap-container-c` (the theme color of each container type, overridden internally per type) and `--ap-ln-gap` (gap between code line numbers and code text; the line-number width `--ap-ln-w` is inlined by the renderer based on digit count).

Usage example:

```css
/* Styles for a site-provided island / component */
.my-widget {
  color: var(--c-text-2);
  background-color: var(--c-bg-soft);
  border: 1px solid var(--c-border);
  border-radius: 0.5rem;
}

.my-widget__button {
  color: var(--c-accent);
  transition: color 140ms ease-out;
}
```

Rules:

- **No hard-coded colors**: take every color/shadow from the table above; for a translucent accent use `color-mix(in srgb, var(--c-accent) 12%, transparent)` (same idiom as the framework internals)
- **Do not override `--c-*` tokens themselves**: reskin via the [override example](#override-example); components read, never write
- **Animations run 120–200ms ease-out**; `prefers-reduced-motion` is handled site-wide, no need to redeclare it inside components
- **Semantic mapping**: for vuepress components see the alias table below — when migrating, swap `--vp-c-*` for the corresponding `--c-*`

## DOM mount points and class hooks

The page shell is generated at build time, and the theme chrome mounts onto fixed placeholder DOM — site CSS and scripts can rely on this structure (produced by the renderer, consumed by the theme; do not rename):

````html
```html
<div id="ap-nav" class="ap-nav"></div>
<!-- navbar -->
<aside id="ap-sidebar" class="ap-sidebar"></aside>
<!-- sidebar -->
<main id="ap-content" class="ap-main">…</main>
<!-- content (full HTML already rendered at build time) -->
<div id="ap-toc" class="ap-toc"></div>
<!-- table of contents -->
<script type="application/json" id="__AP_DATA__">
  …
</script>
<!-- page payload -->
````

The ids are mount anchors for scripts; **site CSS should key on the sibling classes** (`ap-nav` / `ap-sidebar` / `ap-main` / `ap-toc` / `ap-footer`, plus `ap-chrome` on the client-injected theme chrome). Framework styles only use class selectors: id specificity is so strong that a site rule hanging off one survives any future framework default.

- An island placeholder is `<div data-ap-island="Name" data-props="…">`; before activation its inner content is the pre-rendered HTML
- The markdown renderer emits stable classes: containers `ap-container--<type>` (tip/warning/danger/caution/error/info/details/right), tabs `ap-tabs` / `ap-tab` / `ap-tabs--code`, heimu `ap-heimu` (bare `.heimu` also supported), code blocks `ap-code`
- Client behavior hooks: the navbar directory overview row `ap-nav-index-row` (the panel's first row, pointing to the directory index page; badge/divider styling belongs to site CSS); anchor-jump highlight `ap-anchor-flash` (the highlight stays until the user scrolls)

This site's navbar carries a live example of that hook: hover "Guide" and the overview row in the panel's first row has `ap-nav-index-row`; same for nested folders with an index page, whose panel also leads with an overview row.

When overriding these hooks' styles, keep both light and dark themes and mobile usable.

## --vp-c-* compatibility aliases

Vuepress variable aliases are kept for migration, mapping one-to-one onto `--c-*` (by reference, so light/dark stays in sync):

| vuepress alias                                       | Points to     | Note                                                   |
| ---------------------------------------------------- | ------------- | ------------------------------------------------------ |
| `--vp-c-accent`                                      | `--c-accent`  |                                                        |
| `--vp-c-bg`                                          | `--c-bg`      |                                                        |
| `--vp-c-bg-alt` / `--vp-c-bg-soft`                   | `--c-bg-soft` |                                                        |
| `--vp-c-bg-mute`                                     | `--c-bg-mute` |                                                        |
| `--vp-c-text` / `--vp-c-text-1`                      | `--c-text`    |                                                        |
| `--vp-c-text-2` / `--vp-c-text-3`                    | `--c-text-2`  | vuepress's tertiary text converges into secondary text |
| `--vp-c-border` / `--vp-c-divider` / `--vp-c-gutter` | `--c-border`  |                                                        |
| `--vp-c-code-bg`                                     | `--c-code-bg` |                                                        |

Old component styles can be dropped in unchanged; write new components against `--c-*` directly.

## Dark mode mechanics

- The dark toggle is the `html[data-theme="dark"]` attribute
- The user choice persists in localStorage under the `ap-theme` key
- An anti-FOUC script in the page head settles the theme before first paint
- Shiki code highlighting is dual-theme (github-light / github-dark), switched via CSS variables with dark mode
- Islands such as Mermaid and Giscus also listen for theme flips and re-render

## Theme toggle button

The navbar toggle button follows "icon shows the current theme, label describes the action":

- In light mode it shows a sun icon (button aria-label: "switch to dark mode")
- In dark mode it shows a moon icon (aria-label: "switch to light mode")
- With no localStorage record on first visit, it follows `prefers-color-scheme`

## Sidebar behavior

The sidebar is generated automatically from the directory tree (data in `src/node/build/pages.ts`). Interaction contract:

- **A folder row is the index page link**: when a folder has an `index.md`, the row label takes its first h1 and the whole row links to that index page, which then does not repeat as a child item; a folder without an index page degrades to a plain heading row
- **Independent chevron collapse/expand**: the arrow button at the end of a folder row collapses/expands the whole subtree (with aria-expanded, keyboard-operable), separate from the row's navigation duty
- **Auto-expand for the current page**: entering a page expands its path once; a manual collapse is not overridden by auto-expansion, and the state persists across pages
- **Arbitrary nesting depth**: groups nest as deep as the directories do, and each level collapses independently

This site's `guide/advanced/deep` is a live example of multi-level nesting.

## Cascade layers

Every stylesheet on the page lives in a [cascade layer](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer): winners are decided by layer order, independent of selector strength or load order. The order is declared once in each page head:

```css
@layer properties, theme, base, preflights, shortcuts, ap-base, ap-prose, default, ap-chrome;
```

| Layer                                                        | Owner     | Contents                                                                                  |
| ------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------- |
| `properties` / `theme` / `base` / `preflights` / `shortcuts` | uno       | `base` is the reset, `preflights` holds global base rules, `shortcuts` are utility macros |
| `ap-base`                                                    | framework | design tokens, body basics, anchor offsets                                                |
| `ap-prose`                                                   | framework | markdown body defaults (zero specificity — any explicit style overrides them)             |
| `default`                                                    | uno       | utilities                                                                                 |
| `ap-chrome`                                                  | framework | components, islands, layout                                                               |
| (unlayered)                                                  | your site | your CSS                                                                                  |

**Site CSS left out of every layer beats all framework styles** — an override only needs the same selector (or a weaker one), no `html` prefixes, `!important`, or ids. Two caveats:

- The site's uno config must set `outputToCssLayers: true`; otherwise the site's uno reset stays unlayered and flattens the framework typography
- Site CSS injected through uno preflights must return the `preflights` layer to unlayered output via the `cssLayerName` option:

```ts
// uno.config.ts
outputToCssLayers: {
  cssLayerName: layer => (layer === 'preflights' ? null : layer),
},
```

When overriding `--c-*` tokens, provide both light and dark values (tokens live inside a layer, so an unlayered site `:root` also shadows the dark block — see the override example below).

## Override example

A small CSS block reskins the site (shared by all pages; give dark mode its own values too):

```css
:root {
  --c-accent: #2f6fed;
}

html[data-theme='dark'] {
  --c-accent: #6ea1ff;
}
```

## Animation conventions

- Durations 120–200ms, easing ease-out (e.g. background color 160ms, sidebar drawer 180ms)
- The whole site respects `prefers-reduced-motion`
- Tabs, heimu, details, and similar interactions are pure CSS, no JS involved

## Responsive

- `<1024px`: the sidebar collapses into a drawer (toggled via `transform: translateX`)
- `≥1280px`: the right-hand TOC shows, with scroll highlighting
- Content column `max-width: 52rem`, centered

After changing the theme, check both light and dark plus mobile — this is one of the framework's ground rules.
