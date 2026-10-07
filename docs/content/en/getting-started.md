---
date: 2026-10-02
category:
  - guide
tag:
  - english
icon: rocket
---

# Getting Started (EN)

A minimal vite config is all you need: wrap `absolutePress(defineSiteConfig({...}))` as a vite plugin, point `contentDir` at your markdown root, and every `**/*.md` file becomes a standalone `.html` page. The full (Chinese) walkthrough lives at [快速开始](../guide/getting-started.md).

Key facts:

- The package exports its TS sources: `import { absolutePress, defineSiteConfig } from 'absolute-press'` (pnpm `link:` the framework repo; solid-js / @solidjs/web are peer dependencies)
- MPA SSG: static HTML per page, only theme chrome and islands are Solid components
- Dead-link check: `./` and `../` relative links must resolve at build time
- Chinese heading anchors match VuePress byte for byte (the same `@mdit-vue/shared` slugify algorithm)

Continue with the [configuration notes](./configuration.md) or head back to the [English home](./index.md).
