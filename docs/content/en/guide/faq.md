---
date: 2026-10-03
category:
  - guide
tag:
  - faq
icon: solid/circle-question
---

# FAQ

Frequently asked questions by topic; migration questions also see the [Migration guide](./migration.md).

## Migration and compatibility

### Migrating from vuepress-theme-hope — does content really need zero changes

Content syntax, URLs, and Chinese heading anchors are character-for-character compatible; what needs manual work is `<template #xxx>` / vue components (page-by-page conversion) and theme-layer customization (switch to CSS variables and mount-point DOM). Full checklist and steps in the [Migration guide](./migration.md).

### Why frontmatter keys like `order` and `sticky` have no effect

Frontmatter recognizes only six keys: `date` / `category` / `tag` / `icon` / `feed` / `overview`; the rest are ignored. Capabilities like nav ordering and pinning are expressed through site config and directory structure (e.g. `nav.exclude` for "exists but not in nav").

### Does the password protection in old articles still work

The semantics changed: theme-hope encrypts at build time, while Absolute Press is a client-side password gate — the content still ships with the HTML. See [Encryption](./encrypt.md#boundaries-important).

## Known boundaries

### Why vue component syntax shows up verbatim on the page

The markdown pipeline runs with `html: true`, so unknown HTML passes through. `<MyComp />` is emitted as-is when it is not in the island list. Fix: implement it as an island and register it in the site config `islands` (custom), or use built-ins like Mermaid / G2Plot / ZoomedImg. See [Islands](./islands.md).

### Mermaid / G2Plot pages load slowly

Both chunks are large (mermaid also bundles the elk layout engine), and the framework lazy-loads them on demand: a page without charts downloads nothing, and a page with charts fetches them only when used. This is a deliberate size tradeoff; on pages heavy with charts, the wait before the first chart appears is unavoidable.

### Why encrypted page content is visible in the source

The client-side password gate hides without encrypting; the content ships in full with the HTML. By design — see [Encryption](./encrypt.md#boundaries-important).

### Why the related-articles graph shows only a few articles

By default it only aggregates **first-degree mutual neighbors**. The more articles link to each other, the richer the graph; for a bigger graph, set `related.depth` to 2 or 3 (BFS depth; node/edge caps protect the payload, adjustable via `maxNodes`/`maxEdges`). See [Configuration reference](./configuration.md#related).

### Are both image-size syntaxes supported

Yes: `![alt](src =300x)` (inside the parens, after src) and `![alt =300x](src)` (on the alt side) are both parsed by @mdit/plugin-img-size, and either side of `WxH` can be omitted; the obsidian form `![alt|300x200](src)` is not supported. See [Markdown extensions](./markdown.md#images).

### Why the icon on an ArticleCard is not a graphic

Article card icons on the home feed currently render as text chips; the svg icons registered for navbar/sidebar are full graphics. Known boundary, to be improved in a later version.

## Build and deploy

### What to do when the build reports dead link errors

The error lists the source file and the original link. Common causes: the file was moved/renamed and old links were not updated; a directory-style link is wrong (`./x` tries `./x.md` → `./x/index.md` → `./x/README.md` in order). Dead-link checking covers only `./` `../` relative links; external links and pure anchors are not checked.

### Changing code block line numbers / collapsing / wrapping globally

Change the defaults in one place via the site config `code` (`lineNumbers` / `collapsedLines` / `wrap`); individual code blocks override with fence meta (`:wrap=false`, `:collapsed-lines=N`, etc.). See [Configuration reference](./configuration.md#code).

### Pages with Chinese paths 404 after deployment

Check whether the host percent-decodes the request path before file lookup — mainstream static hosts (Cloudflare Pages, Netlify, GitHub Pages, nginx) decode by default, and the framework writes decoded file names to disk, so it normally just works; with a self-built gateway/CDN proxy layer, confirm there is no double encoding. Other deployment questions in the [Deployment guide](./deploy.md).

### What about missing translations on a multi-locale site

The two sides do not need to match page for page: if a locale lacks a page, just do not write that file — the page does not exist in that language, and interlinks follow the actual files. UI text falls back to Chinese for unknown locales; see [Internationalization](./i18n.md).
