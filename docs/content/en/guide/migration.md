---
date: 2026-10-03
category:
  - guide
tag:
  - migration
  - vuepress
icon: migrate
---

# Migration Guide

Absolute Press is designed to replace vuepress-theme-hope: markdown content migrates unchanged, and URLs stay the same. This page lists the compatibility commitments and the known incompatibilities.

## URL compatibility

- Routes keep the `.html` suffix: `docs/xxx.md` → `/xxx.html`, character-for-character identical to the addresses theme-hope generates
- Chinese heading anchors use the same slugify as VuePress 2 (ported from @mdit-vue/shared), **character-for-character identical** to VuePress (Chinese kept as-is, English lowercased, spaces to hyphens), so `#anchor` fragments in old external links keep working
- Base auto-detection: a relative prefix is generated from page depth, so moving to a different deployment sub-path changes no links

## Content syntax compatibility list

The following syntaxes behave the same as theme-hope; content moves over directly:

- `:::` containers: tip / warning / danger / caution / error / info / details / right, custom titles, and `::::` nesting
- tabs / code-tabs + `@tab` / `@tab:active`, `#id` persistence
- Code block line highlights `{1,3-5}`, `:collapsed-lines` (the bare flag collapses at 15 lines, same as theme-hope), `title="..."`
- KaTeX inline `$...$` and block `$$...$$`
- Unicode footnote labels (e.g. `[^胆结石]`)
- Task lists, `==inline marks==`
- heimu blackout `!!text!!`
- Image sizes: both `![alt](src =300x)` and `![alt =300x](src)` are supported (the obsidian form `![alt|300x200](src)` is not)
- An image occupying its own paragraph upgrades to a figure

## Known incompatibilities

- **`<template #xxx>` and vue component syntax**: passed through as unknown HTML (the framework is incompatible); convert page by page when migrating — turn them into islands or rewrite with markdown syntax
- **Frontmatter recognizes only six keys**: `date` / `category` / `tag` / `icon` / `feed` / `overview`; other theme-hope keys (like `order`, `sticky`) are ignored, and capabilities like nav ordering come from site config (e.g. `nav.exclude`)
- **Icons must be registered**: frontmatter `icon` must be a key of the site config `icons` map, validated at build time; theme-hope's iconfont class syntax needs to be swapped for a registered svg
- **Encryption semantics**: theme-hope's password encryption is real build-time encryption; Absolute Press is a client-side password gate (sha256 comparison + sessionStorage, content still ships with the HTML). See [Encryption](./encrypt.md)
- **The related-articles graph** contains first-degree neighbors only; the ArticleCard icon is still a text chip

## Suggested migration steps

1. Put the original site's markdown into the new `contentDir` with the same directory structure — URLs stay unchanged
2. Register the icons the original site used in the site config (svg strings)
3. Run a build: dead-link checking exposes broken relative links in content (the framework errors out when a `./` `../` link fails to resolve); fix them one by one from the error list
4. Convert `<template #xxx>` and vue component syntax page by page
5. Against [Theme customization](./theme.md), wire old custom styles onto the `--c-*` variables (or keep using the `--vp-c-*` aliases)

## Capability comparison cheatsheet

| theme-hope                         | Absolute Press                                          |
| ---------------------------------- | ------------------------------------------------------- |
| `.html` routes + Chinese anchors   | character-for-character compatible                      |
| markdown content syntax            | character-for-character compatible (see the list above) |
| `<template #xxx>` / vue components | passed through; convert page by page                    |
| full frontmatter keys              | only `date/category/tag/icon/feed/overview`             |
| build-time password encryption     | client-side password gate (not real encryption)         |
| theme slots / component overrides  | CSS variables + mount-point DOM                         |

After migrating, the [Markdown extensions](./markdown.md) page doubles as a regression self-check list for content.
