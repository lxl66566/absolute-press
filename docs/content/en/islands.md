---
date: 2026-10-07
category:
  - guide
tag:
  - english
  - islands
icon: rocket
---

# Islands (EN)

Prose stays pure static HTML; interactivity lives in islands: the build renders each `<Tag>` into a `<div data-ap-island>` placeholder, and only those nodes run code in the browser. Write PascalCase tags in markdown — attributes prefixed with `:` parse as JSON, bare attributes become strings, and the island component receives the parsed props plus `childrenHtml` (the pre-rendered inner markdown). Islands are block-level only. The full (Chinese) walkthrough lives at [Islands](../guide/islands.md).

Built-in islands: `Mermaid` (mermaid fences, lazy-loaded SVG), `G2Plot` (charts via `:data`/`:options`), `ZoomedImg` (click-to-zoom images), `ExpandableList` (`@@@` entry tables with search/sort), plus `Giscus` comments and `PasswordGate` which the build layer mounts automatically.

## Site custom islands

Register extra islands via site config `islands` (tag name -> module). A site island default-exports an `IslandComponent` from `absolute-press/client`; see the Counter demo on the [Chinese page](../guide/islands.md).

## Framework utilities for site islands

`absolute-press/client` also exports the building blocks the built-in islands use, so site islands don't re-implement or deep-import them:

| Export                            | Purpose                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `pagePayload()`                   | Read the current page payload (locale, base, title, navbar/sidebar), SPA-nav aware    |
| `hydrateIslands(root?)`           | Hydrate `[data-ap-island]` placeholders under `root` (nested islands after a rebuild) |
| `islandRegistry()`                | The full island registry (builtins + site islands)                                    |
| `mountComponent(comp, el, props)` | Mount a Solid component into an existing DOM node (MPA, no hydrate)                   |
| `cx(...cls)`                      | Conditional className join (static strings, UnoCSS-scannable)                         |
| `flagOn(value, fallback?)`        | Parse boolean island props (JSON booleans, `"false"`/`"0"`, bare attributes)          |
| `pageMessages()`                  | UI copy table for the page language (`<html lang>` prefix, zh fallback)               |
| `formatMessage(tpl, params)`      | Fill `{key}` placeholders in a message template                                       |

```ts
import type { IslandComponent } from 'absolute-press/client';
import { cx, flagOn, formatMessage, pageMessages } from 'absolute-press/client';

const Notice: IslandComponent = props => {
  const t = pageMessages();
  const el = document.createElement('div');
  el.className = cx('my-notice', flagOn(props.compact, false) && 'is-compact');
  const text = typeof props['text'] === 'string' ? props['text'] : '';
  el.textContent = formatMessage(text || '{n} new replies', { n: 3 });
  return el;
};

export default Notice;
```
