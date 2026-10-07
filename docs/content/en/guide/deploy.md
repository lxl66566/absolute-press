---
date: 2026-10-03
category:
  - guide
tag:
  - deployment
icon: deploy
---

# Deployment Guide

The build output is plain static files: run `pnpm exec vite build` once, and `build.outDir` (`dist` for this site) holds the complete site. Any service that hosts static files can deploy it; no Node at runtime, no server-side rendering or API dependencies.

## Output structure

```text
dist/
├── index.html                 # one standalone .html per page; directories are routes
├── guide/
│   ├── index.html             # directory index page
│   └── getting-started.html
├── assets/
│   ├── ...                    # client js/css (theme chrome + islands runtime)
│   └── img/                   # content images, content-hash named
├── rss.xml                    # feed of the latest 20 articles
├── sitemap.xml                # all routes
└── robots.txt
```

- Routes keep the `<path>.html` suffix; `index.md` produces the index page of its directory
- Non-ASCII route segments (e.g. Chinese) are URL-encoded in generated links (like the encoded form of the archive page `/tag/主题.html`), but **the on-disk file name is the decoded original**: static hosts percent-decode the request path before looking up the file, and the two sides line up — Chinese archive routes work out of the box, no rewrite rules needed
- The KaTeX stylesheet and lazily loaded island chunks (Mermaid / G2Plot / DocSearch / photoSwipe) also live under `assets/`, referenced per page via relative paths automatically; no extra configuration

## hostname and sub-paths

`hostname` is the site's canonical origin (no trailing slash), used for absolute links in canonical/og meta, RSS, sitemap, and robots.txt. Set it to the real domain before going live:

```ts
defineSiteConfig({ hostname: 'https://absolute-docs.pages.dev' });
```

All in-page resources and internal links use a relative prefix generated from page depth (`''` for root pages, `'../'` for first-level subdirectories, and so on); there is no absolute-path assumption anywhere in the code. So the site behaves identically whether deployed at a domain root or a sub-path (like `https://example.com/blog/`), and moving the deployment location takes zero config changes.

## Per-host notes

The output has no server-side requirements; mainstream platforms are zero-config or near-zero-config:

- **Cloudflare Pages / Netlify / Vercel**: build command `pnpm build`, output directory = `build.outDir`; no SPA rewrite needed (no `index.html` fallback requirement — every page is a real file)
- **GitHub Pages**: publish the output directory directly; sub-path deployments like `https://user.github.io/repo/` rely on the relative-prefix mechanism above and need no base config
- **nginx / Caddy**: point `root` (or `file_server`) at the output directory; do not configure an SPA fallback like `try_files ... /index.html`

Caching advice: file names under `assets/` carry a content hash (images are `name.8-char-hash.ext`), so cache them long; use short or negotiated caching for `.html` and `rss.xml` / `sitemap.xml` so publishes take effect immediately.

## Build as validation

The build process ships with two kinds of checks, so running one build in CI stops most go-live accidents:

- **Dead-link checking**: every `./` `../` relative link in content is resolved at build time; failures error out listing the source file and the original link — a broken link cannot be published
- **icon validation**: frontmatter `icon` referencing a key not registered in the site config `icons` errors out

Wire the build command into CI (or just use the hosting platform's build pipeline) to get both gates; this site's `vite.config.ts` is a complete configuration you can reference directly.

## CI suggestion

A minimal viable release flow:

```sh
pnpm verify                                  # format / static checks / unit tests
pnpm exec vite build                         # or a docs-specific config
pnpm exec playwright test                    # e2e (spins up its own preview server)
```

After binding the repo on a hosting platform, fill in the "build command" and "output directory" with the build and output above; changing domains means editing `hostname` in the site config once, and `rss.xml` / `sitemap.xml` / `robots.txt` follow automatically on the next build.
