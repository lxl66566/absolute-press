---
date: 2026-10-02
category:
  - guide
tag:
  - markdown
  - self-test
icon: brands/markdown
---

# Markdown extensions

This page actually uses every syntax the markdown pipeline supports, serving as both documentation and a build self-test: as long as this page builds and renders correctly, the corresponding syntax works in the pipeline. Each demo is followed by a code block labeled "Source" containing the exact markdown that produces the effect — copy it into your own articles. The implementation lives in `src/node/markdown/` (the markdown-it pipeline).

## Basic syntax

GFM basics work out of the box: **bold**, _italic_, ~~strikethrough~~, `inline code`, [external link](https://github.com/markdown-it/markdown-it).

**Source:**

```md
GFM basics work out of the box: **bold**, _italic_, ~~strikethrough~~, `inline code`, [external link](https://github.com/markdown-it/markdown-it).
```

Task list checkboxes render in pure CSS, no JS required:

- [x] Completed task
- [ ] Pending task
- [x] Task with inline code `code`

**Source:**

```md
- [x] Completed task
- [ ] Pending task
- [x] Task with inline code `code`
```

## Heading anchors

Heading ids use the same slugify as VuePress 2 (ported from @mdit-vue/shared): non-ASCII characters are kept as-is and output character-for-character identical to VuePress, English is lowercased, spaces become hyphens. Anchors for headings on this page look like:

- [Basic syntax](#basic-syntax) — lowercase, single word
- [Tabs and code groups](#tabs-and-code-groups) — lowercase + hyphens
- [Math](#math) — cross-section jump

Pure anchor links in content (starting with `#`) are kept as-is and skip dead link checking.

## Containers

There are eight `:::` container types: tip / warning / danger / caution / error / info / details / right. The title is customizable and follows the type keyword.

tip holds suggestions and tricks:

::: tip
This is a tip container.
:::

**Source:**

```md
::: tip
This is a tip container.
:::
```

warning holds pitfalls to watch for; danger and caution hold destructive operations and fallback warnings:

::: warning Note
The title follows the type keyword: `::: warning Note`.
:::

**Source:**

```md
::: warning Note
The title follows the type keyword: `::: warning Note`.
:::
```

::: danger
Danger-colored container, for destructive operation warnings.
:::

**Source:**

```md
::: danger
Danger-colored container, for destructive operation warnings.
:::
```

::: caution
A caution container.
:::

**Source:**

```md
::: caution
A caution container.
:::
```

error and info hold error states and neutral notes:

::: error
An error container.
:::

**Source:**

```md
::: error
An error container.
:::
```

::: info
An info container.
:::

**Source:**

```md
::: info
An info container.
:::
```

details is a native `<details>` collapsible container; the summary is the title, and it expands and collapses without JS:

::: details Click to expand
details is a native `<details>` collapsible container; the summary is the title.
:::

**Source:**

```md
::: details Click to expand
details is a native `<details>` collapsible container; the summary is the title.
:::
```

right is a bare wrapper div with no title, for styling purposes:

::: right
right is a bare wrapper div with no title, for styling purposes.
:::

**Source:**

```md
::: right
right is a bare wrapper div with no title, for styling purposes.
:::
```

Containers nest: the outer layer uses longer `::::` markers, and depth can go further:

:::: tip Outer container
Outer content.

::: warning Inner container
The nested inner layer.
:::
::::

**Source:**

```md
:::: tip Outer container
Outer content.

::: warning Inner container
The nested inner layer.
:::
::::
```

Container titles also support inline markdown, e.g. `::: tip use **bold**`.

## Tabs and code groups

Tabs containers split on `@tab` markers, implemented CSS-only (radio-based, no JS). `@tab:active` picks the default selection; the id in `::: tabs#id` persists the selection via `data-persist`, and tab groups sharing the same id sync their selection natively.

::: tabs#ap-docs-tabs
@tab First tab
Content of the first tab, selected by default (the first tab is the fallback).
@tab:active Second tab
Content of the second tab, set as default via `@tab:active`.
@tab Third tab
Content of the third tab.
:::

**Source:**

```md
::: tabs#ap-docs-tabs
@tab First tab
Content of the first tab, selected by default (the first tab is the fallback).
@tab:active Second tab
Content of the second tab, set as default via `@tab:active`.
@tab Third tab
Content of the third tab.
:::
```

An `@tab` marker can be followed by content directly, no blank line needed (the compact style above). Code groups use the code-tabs variant, good for parallel install commands:

::: code-tabs
@tab pnpm

```sh
pnpm add solid-js
```

@tab npm

```sh
npm install solid-js
```

:::

**Source:**

````md
::: code-tabs
@tab pnpm

```sh
pnpm add solid-js
```

@tab npm

```sh
npm install solid-js
```

:::
````

## Code highlighting

Code blocks are highlighted by Shiki with dual themes (github-light / github-dark, switched via CSS variables with the site's light/dark mode). Site-level defaults: line numbers always on, soft wrap always on, blocks over 15 lines auto-collapse into an "expand" button (pure CSS + checkbox, expands without JS). These defaults come from the `code` config field, and each block can override them via fence meta: `{1,3-5}` line highlighting, `title="..."` a title, `:collapsed-lines=N` a collapse threshold, `:collapsed-lines` a bare flag (collapse past 15 lines, same as vuepress-theme-hope), `:no-collapsed-lines` to explicitly stay expanded, `:wrap=false` to disable soft wrap in favor of horizontal scrolling. This meta set composes freely.

A combination of line highlighting + title + stay expanded:

```ts {1,3-4} title="src/counter.ts" :no-collapsed-lines
import { createSignal } from 'solid-js';

export function makeCounter() {
  const [count, setCount] = createSignal(0);
  return {
    count,
    inc: () => setCount(c => c + 1),
  };
}
```

**Source:**

````md
```ts {1,3-4} title="src/counter.ts" :no-collapsed-lines
import { createSignal } from 'solid-js';

export function makeCounter() {
  const [count, setCount] = createSignal(0);
  return {
    count,
    inc: () => setCount(c => c + 1),
  };
}
```
````

The collapse threshold can be tuned per block with `:collapsed-lines=N`. The block below has 7 lines; with the threshold at 6, the last line folds into the expand area:

```ts :collapsed-lines=6
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);
const isPrime = (n: number): boolean => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};
```

**Source:**

````md
```ts :collapsed-lines=6
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);
const isPrime = (n: number): boolean => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};
```
````

A long block without any meta renders with the site defaults. The 18-line TypeScript below triggers the collapse behavior of the bare `:collapsed-lines` flag:

```ts :collapsed-lines
// 1
const a = 1;
// 2
const b = 2;
// 3
const c = 3;
// 4
const d = 4;
// 5
const e = 5;
// 6
const f = 6;
// 7
const g = 7;
// 8
const h = 8;
// 9
const sum = a + b + c + d + e + f + g + h;
```

**Source:**

````md
```ts :collapsed-lines
// 1
const a = 1;
// 2
const b = 2;
// 3
const c = 3;
// 4
const d = 4;
// 5
const e = 5;
// 6
const f = 6;
// 7
const g = 7;
// 8
const h = 8;
// 9
const sum = a + b + c + d + e + f + g + h;
```
````

Soft wrap is the default: overlong lines fold inside the container, reading requires no horizontal scrolling, and line numbers still match the physical lines of the source file. When a block must preserve line structure (diffs, logs, long URLs), use `:wrap=false` for in-container horizontal scrolling. The next line is a deliberately constructed single identifier (no spaces, no break points) to guarantee the content far exceeds the container width:

```ts :wrap=false
thisIsADeliberatelyExtremelyLongSingleTokenIdentifierUsedToDemonstrateHorizontalScrollingInNowrapCodeBlocksAcrossDesktopAndMobileViewportsForEndToEndVerificationPurposes;
```

**Source:**

````md
```ts :wrap=false
thisIsADeliberatelyExtremelyLongSingleTokenIdentifierUsedToDemonstrateHorizontalScrollingInNowrapCodeBlocksAcrossDesktopAndMobileViewportsForEndToEndVerificationPurposes;
```
````

Unknown languages fall back to plain-text highlighting:

```not-a-lang
plain text fallback
```

**Source:**

````md
```not-a-lang
plain text fallback
```
````

## Inline marks and heimu

`==text==` renders as a highlighter-style inline mark, good for key conclusions: this is normal text, ==this part is marked==, normal text again.

**Source:**

```md
`==text==` renders as a highlighter-style inline mark, good for key conclusions: this is normal text, ==this part is marked==, normal text again.
```

heimu (`!!text!!`) is the spoiler mask common in ACG culture: by default a black bar, revealed on hover, with a tooltip bubble on hover (its wording follows the page language); inline markdown still parses inside. The conclusion of this piece is !!migration cost turned out far lower than expected!!; a mask can also hold !!**bold**, `code`, and [links](./getting-started.md)!!.

**Source:**

```md
heimu (`!!text!!`) is the spoiler mask common in ACG culture: by default a black bar, revealed on hover, with a tooltip bubble on hover (its wording follows the page language); inline markdown still parses inside. The conclusion of this piece is !!migration cost turned out far lower than expected!!; a mask can also hold !!**bold**, `code`, and [links](./getting-started.md)!!.
```

## Term references

`[[id]]` references an article from the term library (the roots named by config `refs`, off by default): the text renders as a dotted-underline term, and hovering opens a content-sized popover showing that article's fully rendered markdown; touch taps and keyboard focus trigger it too. `[[id|display text]]` overrides the term text; ids may use subdirectory paths.

On this site (`refs: ['reference']`): the framework uses an [[island]] architecture, rendering at build time via [[ssg|SSG]], shipped as an [[architecture/mpa|MPA]]. The smallest term is a one-liner: [[minimal]].

**Source:**

```md
the framework uses an [[island]] architecture, rendering at build time via [[ssg|SSG]], shipped as an [[architecture/mpa|MPA]]. The smallest term is a one-liner: [[minimal]].
```

The popover holds full markdown: code blocks, formulas, and lists render normally, links stay clickable, and terms can nest further references. An unknown id renders as plain text with a warning while the build still passes — so the term library can live in its own repository (a nested git repo fetched by CI); a failed fetch costs the popovers only, never the build. Directory semantics and config: [configuration reference](./configuration.md#refs).

## Math

Inline formulas use single `$` wrapping: the mass-energy equation $E = mc^2$, Euler's identity $e^{i\pi} + 1 = 0$. Line height stays stable when formulas mix with surrounding text, keeping paragraphs even.

**Source:**

```md
Inline formulas use single `$` wrapping: the mass-energy equation $E = mc^2$, Euler's identity $e^{i\pi} + 1 = 0$. Line height stays stable when formulas mix with surrounding text, keeping paragraphs even.
```

`$$` on its own line renders a centered block formula, suited to derivations and definitions:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

$$
f(n) = \begin{cases} n/2, & n \text{ is even} \\ 3n + 1, & n \text{ is odd} \end{cases}
$$

**Source:**

```md
$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

$$
f(n) = \begin{cases} n/2, & n \text{ is even} \\ 3n + 1, & n \text{ is odd} \end{cases}
$$
```

The KaTeX stylesheet is injected into every page's head at build time; formulas render to HTML at build time, content stays fully static, and the browser does zero formula rendering.

## Footnotes

This is a sentence with a footnote[^1]. Footnote labels support Unicode — for non-ASCII writing you can use semantic labels instead of bare numbers, for example[^胆结石]; the same label can be referenced repeatedly[^1].

[^1]: A footnote definition with a numeric label.

[^胆结石]: A footnote definition with a Unicode label (Chinese for "gallstone"), matching vuepress-theme-hope behavior.

**Source:**

```md
This is a sentence with a footnote[^1]. Footnote labels support Unicode — for non-ASCII writing you can use semantic labels instead of bare numbers, for example[^胆结石]; the same label can be referenced repeatedly[^1].

[^1]: A footnote definition with a numeric label.

[^胆结石]: A footnote definition with a Unicode label (Chinese for "gallstone"), matching vuepress-theme-hope behavior.
```

## Images

Relative-path images are copied to `assets/img/` at build time under content-hash names, with `src` rewritten per page depth, so deploying under any sub-path never breaks them. An image alone in a paragraph is upgraded to `<figure>` and its alt text becomes the figcaption; inline images mixed into a paragraph stay as-is.

Local images (png/jpeg/gif/webp/svg) get their intrinsic size detected at build time, injected as `width`/`height` attributes so the browser reserves layout space before the bytes arrive (no CLS). This covers both the markdown image syntax and raw-HTML `<img>` tags; images with explicit `width`/`height`, external images, and public-root srcs stay untouched.

![Absolute Press diagram](./assets/demo.svg)

**Source:**

```md
![Absolute Press diagram](./assets/demo.svg)
```

An inline image inside a paragraph is not upgraded to a figure: text ![inline](./assets/demo.svg) mixed with an image.

**Source:**

```md
An inline image inside a paragraph is not upgraded to a figure: text ![inline](./assets/demo.svg) mixed with an image.
```

Both image size forms are supported: `![alt](src =WxH)` (size inside the parentheses, after src) and `![alt =WxH](src)` (size on the alt side); width or height can be omitted.

![Explicit size](./assets/demo.svg =120x60)

**Source:**

```md
![Explicit size](./assets/demo.svg =120x60)
```

![alt-side size =120x60](./assets/demo.svg)

**Source:**

```md
![alt-side size =120x60](./assets/demo.svg)
```

The size must follow `=` immediately; an `=` suffix that is not a size (e.g. `![a =wide]`) stays in the alt text as-is. The obsidian form `![alt|300x200](src)` is not supported. External images are kept as-is and get lazy loading automatically:

![External image](https://github.com/github.png)

**Source:**

```md
![External image](https://github.com/github.png)
```

For screenshots that need click-to-zoom, use the ZoomedImg island — see [Islands](./islands.md#zoomedimg).

## Tables

| Feature            |  Status   |                                               Notes |
| :----------------- | :-------: | --------------------------------------------------: |
| Containers         | Supported | tip/warning/danger/caution/error/info/details/right |
| tabs               | Supported |           `@tab` markers; code-tabs for code groups |
| Dead link checking | Supported |                      `./` `../` relative links only |

**Source:**

```md
| Feature            |  Status   |                                               Notes |
| :----------------- | :-------: | --------------------------------------------------: |
| Containers         | Supported | tip/warning/danger/caution/error/info/details/right |
| tabs               | Supported |           `@tab` markers; code-tabs for code groups |
| Dead link checking | Supported |                      `./` `../` relative links only |
```

## Site links and dead link checking

`./` `../` relative links are resolved at build time; a failure is a build error. Resolve order: `./x` → `./x.md` → `./x/index.md` → `./x/README.md`. This page deliberately mixes every form:

- Explicit md suffix: [Getting started](./getting-started.md)
- No suffix (hits `./configuration.md`): [Configuration reference](./configuration)
- Directory-style (hits the directory index): [the guide directory](./) and [component islands](./islands)
- Up across directories: [site home](../index.md)
- Cross-locale: [Getting started (Chinese page)](../../guide/getting-started.md)
- With anchor: [Basic fields in the configuration reference](./configuration.md#basic-fields)
- Anchor on this page: [Math](#math)
- External link (not resolved): [Solid.js](https://www.solidjs.com/)

**Source:**

```md
- Explicit md suffix: [Getting started](./getting-started.md)
- No suffix (hits `./configuration.md`): [Configuration reference](./configuration)
- Directory-style (hits the directory index): [the guide directory](./) and [component islands](./islands)
- Up across directories: [site home](../index.md)
- Cross-locale: [Getting started (Chinese page)](../../guide/getting-started.md)
- With anchor: [Basic fields in the configuration reference](./configuration.md#basic-fields)
- Anchor on this page: [Math](#math)
- External link (not resolved): [Solid.js](https://www.solidjs.com/)
```

Relative links with other extensions (e.g. `./assets/demo.svg`, `../rss.xml`) pass through as asset URLs without md resolution.

Bare relative links (no `./` prefix, e.g. `[x](guide/a.md)`) take no part in this mechanism: they are neither rewritten to a route nor covered by dead link checking, and come out as literal links to `.md`. The site config `strictLinks` controls how loudly they are reported (default `'warn'` lists them at build time, `'error'` fails the build, `'off'` stays silent) — see [Configuration reference](./configuration.md#strictlinks). Always prefix internal links with `./` or `../`.

## HTML passthrough

`html: true`: unknown HTML passes through as-is — <span style="color: var(--c-accent)">an inline HTML fragment</span>. `<template #xxx>` and vue component syntax also pass through as unknown HTML (migrate page by page; see the [Migration guide](./migration.md)).

**Source:**

```md
`html: true`: unknown HTML passes through as-is — <span style="color: var(--c-accent)">an inline HTML fragment</span>. `<template #xxx>` and vue component syntax also pass through as unknown HTML (migrate page by page; see the [Migration guide](./migration.md)).
```

## Build components

Build components share the [islands](./islands.md) PascalCase tag syntax, but their output is final static HTML rendered at build time: no hydration placeholder, no client JS, and the content is fully visible to SEO and no-JS visitors. They fit widgets whose content derives entirely from site data; interactive components still go through islands.

Built-in inventory (single source of truth: `src/shared/components.ts`):

| Tag              | Description                                 |
| ---------------- | ------------------------------------------- |
| `RecentArticles` | Latest and recently updated article columns |

### RecentArticles

```md
<RecentArticles :latest="5" :updated="5" />
```

- `:latest` / `:updated`: per-column entry counts, non-negative integers, both defaulting to 5; `0` hides the column, and zero for both renders nothing at all
- "Latest" sorts by frontmatter `date`, newest first; "Recently updated" sorts by the git last-commit time, newest first, skipping pages without a git time and pages never committed separately (`updatedAt === createdAt`)
- Entries come from the host locale's article list (locale homes are not articles; pages with frontmatter `feed: false` stay listed, matching the home feed)
- Links are page-relative (same shape as body markdown links); the leading icon is the frontmatter `icon` registered svg
- Column headings resolve by the page's `<html lang>` (zh/en); an empty column is omitted entirely, and the component never enters the TOC

Style hooks (site CSS can restyle the whole widget): `ap-recent`, `ap-recent__col`, `ap-recent__title`, `ap-recent__list`, `ap-recent__item`, `ap-recent__link`, `ap-recent__name`, `ap-recent__date`.

The tag is empty/self-closing only: build components have no children slot, and stray inner markdown triggers a build warning and is ignored.

### Disabling built-ins

```ts
buildComponents: {
  disable: ['RecentArticles'],
}
```

A disabled tag renders nothing and warns at build time; an unknown name fails config resolution listing every available component — see the [Configuration reference](./configuration.md#buildcomponents).
