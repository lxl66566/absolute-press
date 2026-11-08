---
date: 2026-10-08
category:
  - design
tag:
  - build
  - markdown
icon: solid/diagram-project
---

# Build Pipeline

This page covers the implementation of markdown rendering and site assembly: the markdown-it pipeline, anchor slugify, dead-link checking, git timestamps, excerpts, and RSS. The code lives in `src/node/markdown/` (rendering) and `src/node/build/` (site assembly); see [Architecture](./architecture.md) for the overall picture.

## Why markdown-it + @mdit

The framework's migration goal was moving a VuePress 2 blog over, and the syntax had to match page by page. VuePress 2's markdown layer is markdown-it plus the @mdit plugin family. Choosing the same engine means containers, frontmatter, anchors, and image sizing align directly with upstream semantics; migration cost reduces to rewriting content page by page instead of translating syntax point by point.

The plugin stack in `src/node/markdown/renderer.ts` is mostly the @mdit family plus a few custom rules:

```ts
md.use(katex);
md.use(footnote);
md.use(tasklist);
md.use(mark);
md.use(legacyImgSize);
md.use(imgSize);
```

remark/rehype is an AST pipeline; its ecosystem revolves around MDX, and its plugin semantics do not match VuePress. What this framework needs — injecting link resolution at render time and rewriting output per token — maps more directly onto markdown-it's token stream. The custom parts (heimu, tabs, entry splitting) are all rule-level injections that leave the core untouched.

`createMarkdownRenderer` stays a pure function: it never touches the filesystem. Link and image resolution are injected via `options.resolveLink / resolveImage` (`LinkResolver` in `src/node/build/assets.ts`), and code-highlight options flow in explicitly from the site config. The renderer can be unit-tested without a site.

## Chinese heading slugify

`src/node/markdown/slugify.ts` is a line-by-line port of the slugify from `@mdit-vue/shared`, the algorithm VuePress 2 feeds to markdown-it-anchor: NFKD normalization, stripping combining marks and control characters, folding runs of special characters into a single `-`, trimming leading/trailing `-`, prefixing `_` when the result starts with a digit, and lowercasing. Chinese characters match no rule and pass through unchanged.

Verbatim compatibility exists for external anchor links: search engine indexes, references from other articles, and `#some-section` links pasted in comments all carry the old anchors. One character of difference in the algorithm is a batch of dead links.

Duplicate-heading dedup also follows markdown-it-anchor semantics: the `Slugger` class keeps a seen-set per render and appends `-1`, `-2` on collisions. The whole page (including fragments inside islands) shares one `Slugger`, so headings inside islands never collide with body heading ids.

## Dead-link checking

Internal relative links are resolved at build time; failures are errors. The resolution semantics live in `LinkResolver.resolveLink` (`src/node/build/assets.ts`), matching VuePress:

```ts
const candidates = bare.endsWith('.md')
  ? [bare]
  : [`${bare}.md`, `${bare}/index.md`, `${bare}/README.md`];
```

`./x` tries `./x.md`, `./x/index.md`, `./x/README.md` in order; on a hit it is converted into a relative href between the two page routes, so links hold under any deploy base. A miss is recorded in `deadLinks`; the build calls `this.error` in `generateBundle` and lists `file:line -> original link`. In dev, requesting a page with dead links warns once, and the page renders normally.

Why fail hard: the links of a static site are a contract once deployed, and build time is the last moment to check them globally. Passing loosely means publishing 404s on purpose. Local images go through the same pipeline: `resolveImage` records a dead link when the disk read fails; on success, build copies the image to `assets/img/<name>.<hash><ext>` with a content hash, and dev serves it via `/@fs/`. Bare relative links without a `./` prefix are not errors; they are handled separately by the `strictLinks` option.

### Anchor validation

A resolved link that carries an anchor gets an extra record in `LinkResolver.anchorLinks`: `{file, raw, targetRoute, fragment}` (`:~:text=` scroll-to-text fragments keep their main id; pure text fragments are not recorded). At the end of the build, `anchorReport` (`src/node/build/anchors.ts`) checks each fragment against the element id set of the target page's rendered html (`htmlIdsOf`: heading anchors, xlist entry anchors and footnote ids all count); a miss fails the build with source lines joined the same way as dead links. Targets outside the current render context (archive pages) have no known id set and are skipped — a missed report is harmless, a false positive would break the build. Dev warns for the requested page, same semantics as dead links.

## Git last-edited time

Page meta `updatedAt` comes from the git last-commit time (`src/node/build/git.ts`). Calling `git log` per file is too slow, so `getGitTimes` queries in batches:

- One `git log --format=\x01%cI --name-only --no-renames` per batch of about 100 paths, with `\x01` as the commit-line marker. git log orders newest first, so a file's first occurrence is its latest time.
- Batch concurrency capped at 4: every `git log` walks the full history, and unbounded concurrency means N batches pressing CPU/IO at once.
- Batch size 100 stays far from the ~32K argv limit of Windows CreateProcess.
- `core.quotepath=off` makes git output raw non-ASCII paths; with the default config, Chinese filenames are C-escaped into forms that no longer match disk paths.

Failure tiers: not a git repo or missing git returns an empty table for the whole site (all `updatedAt` null); a single failed batch only loses that batch's files with a warning, leaving other batches unaffected.

## Excerpts and the render cache

`SiteStore` (`src/node/build/site.ts`) holds the render cache: `filePath -> { mtimeMs, result, excerpt }`. Builds judge freshness by mtime; dev trusts the watcher's `invalidate()/resync()`. A hit skips the whole render.

`excerpt` is cached with the same lifecycle as the render result. `plainExcerpt` (`src/node/excerpt.ts`) strips script/style/pre and all tags from the rendered HTML, decodes entities, and collapses whitespace; the head meta description takes 160 chars (`META_EXCERPT_LIMIT`), RSS takes 200. Rescanning every page's full text on each emit or dev request is wasteful, so the excerpt is cached together with the render; it only depends on the render output, so the invalidation conditions match exactly.

The renderer instance itself is also cached by Shiki language set: `SiteStore` first scans all source files for fence languages and passes the set to `createMarkdownRenderer`, so cold start loads only the grammars the site actually uses (loading everything measured about 2 seconds). When an edit in dev introduces a new language, a dirty flag is set, and the renderer is rebuilt with the render cache cleared before the next request.

## RSS excerpts and full content

The item description in `renderRss` (`src/node/build/feeds.ts`) defaults to `plainExcerpt(html, FEED_EXCERPT_LIMIT)`, never the full text; `feed.full: true` switches it to the full rendered HTML. Full content requires rewriting every asset token and in-page relative link into an absolute URL (addresses only resolvable within the site), which the internal `feedContent` does: it matches only `href=` / `src=` attribute positions (same contract as the shell's `applyAssetBase`; a literal token in prose stays untouched), joins `absasset:` tokens with `hostname`, and resolves `./` `../` via `new URL(href, hostname + the route's directory)`. The rewritten HTML enters `<description>` through `escapeXml`, without CDATA — the body may contain a literal `]]>`. Why excerpts stay the default: RSS readers vary widely in their HTML support, and a compact preview plus the item link is a shape both consumers (RSS readers and head meta) can use.

Remaining details: pages with `feed: false` are filtered out before data collection; the entry count cap is `feed.rssLimit`, default 20; the site-wide feed declares the default locale's BCP-47 tag in `<language>`, while each extra locale's own feed (`/<key>/rss.xml`, passed as the third argument) declares its own. Sitemap `lastmod` uses the git batch-query results above; archive pages have no source file and get no `lastmod`. Cross-locale pages and archives carry hreflang alternates from the same source as the links in the page head.

## Page minification

Emitted page HTML passes through `minifyHtml` (`src/node/build/minify-html.ts`): a single-pass scan that deletes only the whitespace runs between the `>` of a block-level closing or void tag and the `<` of a block-level open tag, plus a whole-document trim. `pre/textarea/script/style/svg/template` are raw regions — contents verbatim, boundaries treated as inline — so the payload JSON, inline scripts, code-block indentation and attribute values are untouched; inline tag boundaries, comments and text nodes never change. The conservative rules keep the saving modest (inter-block newlines are the main target), but rendered output is byte-stable. Dev skips minification, staying consistent with vite's dev transform.
