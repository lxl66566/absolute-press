---
date: 2026-10-08
icon: solid/lightbulb
category: [design]
tag: [ssg]
---

# Why Another One

Static site generators are common. This framework exists for a specific reason: the author's own blog had to migrate away from [vuepress-theme-hope](https://theme-hope.vuejs.press/), and every existing option was missing a piece. This page covers what problem it solves, how it differs from adjacent options, and what it costs.

## Starting point: a migration

Three motivations drove the migration, all from long-term VuePress use:

- No more Vue components. The author knows SolidJS best; its runtime performance is in the top tier of mainstream frameworks, and its component model is simple.
- VuePress internals have styles and behaviors that cannot be changed. Large themes like theme-hope make this worse: deep customization costs more than owning the framework.
- Slow builds, slow loads. Full build time and page critical-path size both missed expectations.

The conclusion: a framework under full control, with every requirement built in, is less work than patching someone else's theme. Every requirement of the framework comes from this one real site.

## Positioning

absolute-press is an MPA + islands static blog framework, not a general-purpose site generator. The positioning rules:

- The directory is the configuration. The navbar, sidebar, category/tag archives, homepage article feed, and TOC are all derived from the content directory structure; `index.md` is the directory index page. Frontmatter only recognizes six keys: `date / category / tag / icon / feed / overview`.
- Everything that can be done at build time is done at build time. Markdown rendering, containers and tabs, Shiki highlighting, KaTeX, dead-link checking, git last-edited time, and RSS/sitemap all happen at build time. The output is plain HTML.
- Page interactivity goes to islands only. Write `<MyIsland prop="str" :num="1">inner markdown</MyIsland>` directly in the markdown body; it is pre-rendered into a placeholder at build time, and only those nodes execute code in the browser. The body stays plain HTML.

## Differences from Astro

Astro is the closest framework in spirit: same islands, same Vite-based static-first approach. Four differences:

- Content conventions. Astro's navbar, archives, TOC, and article feeds come from themes and integrations — the inevitable shape of a general-purpose generator. In absolute-press these are all built in, decided directly by the directory structure.
- Island syntax. Astro uses the `.astro` DSL to annotate components with hydration strategies; the component inventory is determined by page structure. absolute-press components are written inside the markdown body, carry props, and can nest markdown inside; the body introduces no MDX or component syntax.
- Markdown enhancements. Astro uses the remark/rehype ecosystem; container syntax, code enhancements, and math require picking plugins and assembling a pipeline yourself. absolute-press ships them out of the box, with syntax rules kept verbatim-compatible with VuePress to ease migration from VuePress.
- Customization. Deep customization of Astro usually starts by copying a theme. absolute-press exposes a set of stable contracts — `#ap-*` mount points, `ap-container--*` renderer classes, light/dark CSS variable pairs — and the site wraps its own styles and components around the contracts.

## Differences from VuePress / VitePress

VuePress and VitePress are the Vue answers to the same problem: markdown-plus-components content site frameworks. Beyond the three migration motivations above, there are two structural differences:

- They are SPAs. absolute-press is an MPA: each page is a standalone `.html`, readable without JS, and the first request needs only 2 RTT.
- Their markdown component syntax (Vue single-file components, component blocks in frontmatter) weaves the component model into the content format. absolute-press markdown stays plain markdown; island tags are processed away at build time.

## Measured performance

Measured on this repo's docs site (22 pages, zh + en locales, Windows):

- Full build about 2s; dev cold start to first byte about 2.2s.
- Page critical path about 65KB gzip (entry JS 55KB + CSS 10KB). Mermaid, G2Plot, Algolia search, image zoom, and the related-articles graph all load dynamically on demand; KaTeX styles are injected only into pages with formulas.
- Dual-strategy render cache: builds reuse by mtime, dev invalidates per page from watcher events; unchanged pages are never re-rendered.

These numbers rest on a narrowed scope: a blog framework only handles blog-scale sites, so caching, on-demand loading, and dual-theme highlighting can all be designed for that scale, with no headroom reserved for general-purpose scenarios.

## Costs

Tradeoffs must be stated together with their costs:

- MPA has no SPA-style cross-page transitions. The compensation is Speculation Rules: hover prefetches the target page HTML, pointerdown starts prerendering, and by activation the page is usually ready. Safari and Firefox ignore this script type and fall back to normal full-page loads, which still behaves correctly.
- The islands ecosystem is much smaller than Astro's. The framework ships Giscus, Mermaid, G2Plot, image zoom, expandable tables, and a password gate; anything else must be registered as a Solid component in the site config.
- Directory-as-configuration means the information architecture must map to a directory tree. Sites that need multiple views (the same articles organized along different dimensions) do not fit this model.
- The framework has no plugin system. The extension point of the markdown pipeline and build flow is the source code itself. This pairs with the "ship the source" decision: the npm package publishes `src/` directly, and the host's Vite loads the TS.
