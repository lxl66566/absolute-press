---
date: 2026-10-01
icon: solid/book
---

# Guide

All guide pages listed in reading order, for people building sites and writing with Absolute Press. A directory index page `index.md` becomes the entry point of its directory in the navbar/sidebar; its title comes from the first h1.

- [Getting started](./getting-started.md): installation, minimal config, directory structure, and the build flow
- [Configuration reference](./configuration.md): every site config field
- [Writing guide](./writing.md): frontmatter, date fallback, internal links, and images
- [Markdown extensions](./markdown.md): every syntax the pipeline supports, demonstrated and self-tested
- [Islands](./islands.md): built-in and custom component islands
- [Theme customization](./theme.md): CSS variables, dark mode, and sidebar behavior
- [i18n](./i18n.md): multi-locale content organization and UI strings
- [Search and comments](./search-comments.md): Algolia DocSearch and Giscus integration
- [SEO and feeds](./seo.md): head meta, RSS, sitemap, and robots
- [Deployment](./deploy.md): static output structure and per-host notes
- [Encryption](./encrypt.md): the client-side password gate and its limits
- [FAQ](./faq.md): migration questions and known limits
- [Migration guide](./migration.md): migrating from vuepress-theme-hope

Directory-style links also work: [back to this directory's index](./) is equivalent to [the guide index](./index.md).

Developers interested in framework internals (design motivation, build pipeline, island runtime) should head to the [Design and implementation](./design/index.md) subsection.
