# Absolute Press

A SolidJS static blog framework: write content in markdown, write interactions as Solid components. MPA SSG + islands architecture, built on vite 8 (rolldown) and SolidJS 2.

[GitHub](https://github.com/lxl66566/absolute-press) · [Author's blog](https://absx.pages.dev/) (built with this framework)

This site doubles as the end-to-end demo ground for the framework: every guide actually uses the feature it describes — the search box, comment section, encrypted page, and chart islands are all live.

## Quick start

```bash
pnpm create absolute-press my-blog
cd my-blog
pnpm install && pnpm dev
```

## Features

- **Directories are the information architecture**: navbar, sidebar, category/tag archives, and the home article feed are all derived from the content directory; frontmatter has only six keys
- **Full markdown extensions**: eight container types, tabs/code groups, Shiki dual-theme highlighting, KaTeX, footnotes, spoiler masks, dead link checking — see [Markdown extensions](./guide/markdown.md)
- **Islands for interaction**: content stays fully static; interactive components are written as tags directly in markdown, pre-rendered at build time and activated on demand in the client — see [Islands](./guide/islands.md)
- **Built-in site features**: search, comments, RSS/sitemap, password gate, related-article graph, i18n — fill in the config and they work, see [Configuration reference](./guide/configuration.md)
- **Fast**: this site (20+ pages, Chinese and English) builds in about 2s; the page critical path is about 65KB gzip; heavy resources all load on demand

## Reading paths

- Build your own site: start at [Getting started](./guide/getting-started.md), then continue with the [Guide](./guide/index.md)
- Migrating from vuepress-theme-hope: [Migration guide](./guide/migration.md); content syntax is character-for-character compatible
- Design trade-offs and implementation details for SSG developers: [Design and implementation](./guide/design/index.md)

<RecentArticles />

## License

MIT
