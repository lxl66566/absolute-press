---
date: 2026-10-03
category:
  - guide
tag:
  - english
  - markdown
icon: rocket
---

# Markdown Showcase (EN)

A condensed English tour of the markdown pipeline. The full Chinese self-test page lives at [Markdown 扩展](../guide/markdown.md); everything below is rendered by the same pipeline, so if this page builds and looks right, the features work.

## Containers

`:::` containers: tip / warning / danger / caution / error / info / details / right, with an optional custom title after the keyword. Nesting works with longer `::::` markers.

::: tip
A plain tip container.
:::

**Source:**

```md
::: tip
A plain tip container.
:::
```

:::: warning Outer with title
Outer content.

::: danger Inner
The inner container uses the shorter `:::`.
:::
::::

**Source:**

```md
:::: warning Outer with title
Outer content.

::: danger Inner
The inner container uses the shorter `:::`.
:::
::::
```

## Tabs and code groups

Tabs split on `@tab` markers and are CSS-only (radio based). `@tab:active` picks the default tab; `::: tabs#id` persists the selection and syncs groups sharing the same id.

::: tabs#en-demo-tabs
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
::: tabs#en-demo-tabs
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

## Code Blocks

Code fences are highlighted by Shiki with dual themes (github-light / github-dark). Site defaults: line-number gutter on, soft wrap on, blocks longer than 15 lines collapsed behind a no-JS expander. Fence meta overrides per block: `{1,3-4}` highlights lines, `title="..."` adds a caption, `:collapsed-lines=N` or bare `:collapsed-lines` sets the fold threshold, `:no-collapsed-lines` keeps a block expanded, `:wrap=false` restores horizontal scrolling.

```ts {1,3-4} title="src/counter.ts" :no-collapsed-lines
import { createSignal } from 'solid-js';

export function makeCounter() {
  const [count, setCount] = createSignal(0);
  return { count, inc: () => setCount(c => c + 1) };
}
```

**Source:**

````md
```ts {1,3-4} title="src/counter.ts" :no-collapsed-lines
import { createSignal } from 'solid-js';

export function makeCounter() {
  const [count, setCount] = createSignal(0);
  return { count, inc: () => setCount(c => c + 1) };
}
```
````

The next block is 18 lines, so the site default folds it with an expander:

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
const total = a + b + c + d + e + f + g + h;
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
const total = a + b + c + d + e + f + g + h;
```
````

## Inline marks, heimu, tasks

Bold **a**, italic _b_, strikethrough ~~c~~, inline `code`, highlight ==marked text==, and the heimu spoiler: this is visible, !!this hides until hover!! (a localized tooltip appears while revealed).

- [x] Done
- [ ] Not done

**Source:**

```md
Bold **a**, italic _b_, strikethrough ~~c~~, inline `code`, highlight ==marked text==, and the heimu spoiler: this is visible, !!this hides until hover!! (a localized tooltip appears while revealed).

- [x] Done
- [ ] Not done
```

## Math and footnotes

Inline math $e^{i\pi} + 1 = 0$ and a block formula:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

Footnotes support Unicode labels[^1], for example[^note].

[^1]: Numeric label.

[^note]: Unicode label.

**Source:**

```md
Inline math $e^{i\pi} + 1 = 0$ and a block formula:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

Footnotes support Unicode labels[^1], for example[^note].

[^1]: Numeric label.

[^note]: Unicode label.
```

## Images

Relative images are copied to `assets/img/` with content-hash names and depth-correct src rewriting. A solo-paragraph image upgrades to a `<figure>` with the alt text as figcaption. Both size syntaxes work:

![Sized image](../guide/assets/demo.svg =120x60)

**Source:**

```md
![Sized image](../guide/assets/demo.svg =120x60)
```

![Alt-side size =120x60](../guide/assets/demo.svg)

**Source:**

```md
![Alt-side size =120x60](../guide/assets/demo.svg)
```

The size is `WxH` with either side omissible; a non-size `=` suffix (e.g. `![a =wide]`) stays literal in the alt text. The obsidian form `![alt|300x200](src)` is not supported.

## Expandable list

The `ExpandableList` builtin island splits its children at `@@@ Title` lines and renders them as a real table: title column, one meta cell per `@@` segment (segments split on top-level `|`; a single-segment meta stays one column), and a row-end chevron that rotates on expand. After hydration it gains search, sort and expand/collapse controls plus a "click a row" hint bubble; the UI copy follows the page language (`<html lang>`). `:columns='["Title", "Meta", …]'` labels the header row:

<ExpandableList :columns='["Title","Duration","Score","Notes"]'>

@@@ Rich entry
@@ | 23h | 8 | containers, tables and images work inside entries

Containers, tables and images work inside entries:

| Feature | Available |
| ------- | --------- |
| Search  | yes       |
| Sort    | yes       |

@@@ Second entry
@@ | 12h | -1.5 | bare-number cells >= 10 render green, <= 0 red

Entries render as separate markdown fragments at build time; entry headings stay out of the page TOC.

</ExpandableList>

**Source:**

```md
<ExpandableList :columns='["Title","Duration","Score","Notes"]'>

@@@ Rich entry
@@ | 23h | 8 | containers, tables and images work inside entries

| Feature | Available |
| ------- | --------- |
| Search  | yes       |

@@@ Second entry
@@ | 12h | -1.5 | …

</ExpandableList>
```

The full island reference (syntax details, nested islands, customization) is in the Chinese [Islands chapter](../guide/islands.md).

## Internal links and dead-link checks

Relative `./` and `../` links are resolved at build time; failures fail the build. Resolution tries `./x` -> `./x.md` -> `./x/index.md` -> `./x/README.md`. Mixed forms on this page:

- Explicit suffix: [configuration notes](./configuration.md)
- Directory link: [English home](./) equals [index](./index.md)
- Cross-locale: [Chinese markdown showcase](../guide/markdown.md)
- With anchor: [configuration keys](./configuration.md#configuration-en)
- External (not resolved): [markdown-it](https://github.com/markdown-it/markdown-it)

**Source:**

```md
- Explicit suffix: [configuration notes](./configuration.md)
- Directory link: [English home](./) equals [index](./index.md)
- Cross-locale: [Chinese markdown showcase](../guide/markdown.md)
- With anchor: [configuration keys](./configuration.md#configuration-en)
- External (not resolved): [markdown-it](https://github.com/markdown-it/markdown-it)
```

Relative links with another extension (`./assets/demo.svg`, `../rss.xml`) pass through as asset URLs without markdown resolution.

Bare relative links without the `./` prefix (e.g. `[x](guide/a.md)`) skip this machinery entirely: they are neither rewritten to `.html` nor dead-link checked, and ship pointing at the raw `.md` path. Always prefix site links with `./` or `../`.

Back to the [English home](./index.md).
