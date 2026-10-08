---
date: 2026-10-02
category:
  - 指南
tag:
  - markdown
  - 自测
icon: markdown
---

# Markdown 扩展

本页把 markdown 管线支持的每种语法真实用一遍，既是文档也是构建自测：只要本页能构建通过、渲染正常，对应的语法就在管线上工作。每个演示下方跟着标有「源码」的代码块，就是产生该效果的 markdown 写法，可以直接复制到自己的文章里。实现位于 `src/node/markdown/`（markdown-it 管线）。

## 基础语法

GFM 基础能力开箱即用：**加粗**、_斜体_、~~删除线~~、`行内代码`、[外链](https://github.com/markdown-it/markdown-it)。

**源码：**

```md
GFM 基础能力开箱即用：**加粗**、_斜体_、~~删除线~~、`行内代码`、[外链](https://github.com/markdown-it/markdown-it)。
```

任务列表的勾选框是纯 CSS 渲染，不依赖 JS：

- [x] 已完成任务
- [ ] 未完成任务
- [x] 带行内代码的任务 `code`

**源码：**

```md
- [x] 已完成任务
- [ ] 未完成任务
- [x] 带行内代码的任务 `code`
```

## 中文标题锚点

标题 id 用 VuePress 2 同款 slugify（移植自 @mdit-vue/shared）：中文原样保留、与 VuePress 逐字一致，英文转小写、空格转连字符。本页各标题的锚点形如：

- [基础语法](#基础语法)——纯中文原样输出
- [Tabs 与代码组](#tabs-与代码组)——英文小写 + 连字符
- [数学公式](#数学公式)——跨节跳转

正文里的纯锚点链接（`#` 开头）原样保留，不参与死链检查。

## 容器

`:::` 容器类型一共八种：tip / warning / danger / caution / error / info / details / right。标题可自定义，跟在类型关键词后面。

tip 用来放建议与小技巧：

::: tip
这是一个 tip 容器。
:::

**源码：**

```md
::: tip
这是一个 tip 容器。
:::
```

warning 放需要注意的坑，danger 与 caution 放破坏性操作与兜底警告：

::: warning 注意
标题跟在类型关键词后面：`::: warning 注意`。
:::

**源码：**

```md
::: warning 注意
标题跟在类型关键词后面：`::: warning 注意`。
:::
```

::: danger
危险色容器，用于破坏性操作提示。
:::

**源码：**

```md
::: danger
危险色容器，用于破坏性操作提示。
:::
```

::: caution
caution 容器。
:::

**源码：**

```md
::: caution
caution 容器。
:::
```

error 与 info 放错误状态与中性说明：

::: error
error 容器。
:::

**源码：**

```md
::: error
error 容器。
:::
```

::: info
info 容器。
:::

**源码：**

```md
::: info
info 容器。
:::
```

details 是原生 `<details>` 折叠容器，summary 即标题，无 JS 也能展开收起：

::: details 点我展开
details 是原生 `<details>` 折叠容器，summary 即标题。
:::

**源码：**

```md
::: details 点我展开
details 是原生 `<details>` 折叠容器，summary 即标题。
:::
```

right 容器是无标题的裸包装 div，供样式用途：

::: right
right 容器是无标题的裸包装 div，供样式用途。
:::

**源码：**

```md
::: right
right 容器是无标题的裸包装 div，供样式用途。
:::
```

容器支持嵌套，外层用更长的 `::::` 标记，层级可以继续加深：

:::: tip 外层容器
外层内容。

::: warning 内层容器
嵌套的内层。
:::
::::

**源码：**

```md
:::: tip 外层容器
外层内容。

::: warning 内层容器
嵌套的内层。
:::
::::
```

容器标题也支持行内 markdown，例如 `::: tip 使用 **bold**`。

## Tabs 与代码组

tabs 容器按 `@tab` 标记切分，CSS-only 实现（radio 方案，无需 JS）。`@tab:active` 指定默认选中项；`::: tabs#id` 的 id 用 `data-persist` 持久化选中态，共享同一 id 的 tab 组会原生同步选择。

::: tabs#ap-docs-tabs
@tab 第一项
第一项的内容，默认选中（首个 tab 兜底）。
@tab:active 第二项
第二项的内容，通过 `@tab:active` 指定为默认选中。
@tab 第三项
第三项的内容。
:::

**源码：**

```md
::: tabs#ap-docs-tabs
@tab 第一项
第一项的内容，默认选中（首个 tab 兜底）。
@tab:active 第二项
第二项的内容，通过 `@tab:active` 指定为默认选中。
@tab 第三项
第三项的内容。
:::
```

`@tab` 标记可以直接紧跟内容，不必留空行（上面就是紧凑写法）。代码组用 code-tabs 变体，适合并列多个安装命令：

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

**源码：**

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

## 代码高亮

代码块由 Shiki 双主题高亮（github-light / github-dark，随站点亮暗通过 CSS 变量切换）。站点级默认：行号常开、软换行常开、超过 15 行自动折叠成「展开」按钮（纯 CSS + checkbox，无 JS 也能展开）。这些默认值由配置项 `code` 控制，每个代码块也可以用围栏 meta 覆盖：`{1,3-5}` 行高亮、`title="..."` 标题、`:collapsed-lines=N` 折叠阈值、`:collapsed-lines` 裸旗标（超过 15 行折叠，与 vuepress-theme-hope 一致）、`:no-collapsed-lines` 显式保持展开、`:wrap=false` 关闭软换行改横向滚动。这套 meta 可以自由组合。

行高亮 + 标题 + 保持展开的组合：

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

**源码：**

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

折叠阈值可以用 `:collapsed-lines=N` 按块调整。下面的块有 7 行，阈值压到 6，最后一行收进展开区：

```ts :collapsed-lines=6
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);
const isPrime = (n: number): boolean => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};
```

**源码：**

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

不带任何 meta 的长块按站点默认渲染。下面这段 18 行的 TypeScript 触发裸 `:collapsed-lines` 旗标的折叠行为：

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

**源码：**

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

软换行是默认行为：超长行折进容器内，阅读不需要横向滚动，行号仍对应源文件的物理行。个别块需要保持行结构时（diff、日志、长 URL），用 `:wrap=false` 改为容器内横向滚动。下一行是刻意构造的单一标识符（无空格、无断点），确保内容远超容器宽度：

```ts :wrap=false
thisIsADeliberatelyExtremelyLongSingleTokenIdentifierUsedToDemonstrateHorizontalScrollingInNowrapCodeBlocksAcrossDesktopAndMobileViewportsForEndToEndVerificationPurposes;
```

**源码：**

````md
```ts :wrap=false
thisIsADeliberatelyExtremelyLongSingleTokenIdentifierUsedToDemonstrateHorizontalScrollingInNowrapCodeBlocksAcrossDesktopAndMobileViewportsForEndToEndVerificationPurposes;
```
````

未知语言回退为纯文本高亮：

```not-a-lang
plain text fallback
```

**源码：**

````md
```not-a-lang
plain text fallback
```
````

## 行内标记与黑幕

`==文本==` 渲染为荧光笔效果的行内标记，适合标注关键结论：这是普通文字，==这一段被标记==，继续普通文字。

**源码：**

```md
`==文本==` 渲染为荧光笔效果的行内标记，适合标注关键结论：这是普通文字，==这一段被标记==，继续普通文字。
```

heimu 黑幕（`!!文本!!`）是 ACG 文化圈常见的剧透遮罩：默认是一块黑条，鼠标悬停才显形，悬停时会浮现提示气泡（文案随页面语言），内部照常解析行内 markdown。这篇的结论是!!框架迁移成本比预想的低得多!!；黑幕里也可以放 !!**加粗**、`代码` 与 [链接](./getting-started.md)!!。

**源码：**

```md
heimu 黑幕（`!!文本!!`）是 ACG 文化圈常见的剧透遮罩：默认是一块黑条，鼠标悬停才显形，悬停时会浮现提示气泡（文案随页面语言），内部照常解析行内 markdown。这篇的结论是!!框架迁移成本比预想的低得多!!；黑幕里也可以放 !!**加粗**、`代码` 与 [链接](./getting-started.md)!!。
```

## 术语引用

`[[id]]` 引用术语库（config `refs` 指定的目录，默认不启用）里的一篇 markdown：正文渲染为带虚线下划线的术语，鼠标悬停弹出悬浮窗，展示该文章渲染后的完整 markdown；触屏点按、键盘聚焦同样触发。`[[id|显示文本]]` 自定义术语文字，id 支持子目录路径。

以本文档站为例（`refs: 'reference'`）：框架采用 [[island]] 架构，构建期完成 [[ssg|SSG]]，站点形态是 [[architecture/mpa|MPA]]。

**源码：**

```md
框架采用 [[island]] 架构，构建期完成 [[ssg|SSG]]，站点形态是 [[architecture/mpa|MPA]]。
```

悬浮窗内是完整的 markdown：代码块、公式、列表照常渲染，链接照常可点，术语自身也可以再嵌套引用。未命中的 id 渲染为纯文本并打 warning，构建照常通过——术语库因此可以独立成仓（git 嵌套仓、CI 拉取），拉取失败只损失悬浮窗，不影响构建产物。目录与配置详见[配置参考](./configuration.md#refs)。

## 数学公式

行内公式用单个 `$` 包裹：质能方程 $E = mc^2$、欧拉公式 $e^{i\pi} + 1 = 0$。公式与中文混排时行高稳定，不会把段落撑得参差不齐。

**源码：**

```md
行内公式用单个 `$` 包裹：质能方程 $E = mc^2$、欧拉公式 $e^{i\pi} + 1 = 0$。公式与中文混排时行高稳定，不会把段落撑得参差不齐。
```

`$$` 独占一行时渲染为居中的块级公式，适合推导与定义：

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

$$
f(n) = \begin{cases} n/2, & n \text{ 为偶数} \\ 3n + 1, & n \text{ 为奇数} \end{cases}
$$

**源码：**

```md
$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

$$
f(n) = \begin{cases} n/2, & n \text{ 为偶数} \\ 3n + 1, & n \text{ 为奇数} \end{cases}
$$
```

KaTeX 的样式表在构建期注入每页 head，公式在构建期渲染成 HTML，正文保持纯静态，浏览器端没有公式渲染开销。

## 脚注

这是一个带脚注的句子[^1]，脚注标签支持 Unicode——对中文写作来说可以用语义化标签而不是干巴巴的数字，例如[^胆结石]；同一标签也可以重复引用[^1]。

[^1]: 数字标签的脚注定义。

[^胆结石]: Unicode 标签的脚注定义，与 vuepress-theme-hope 行为一致。

**源码：**

```md
这是一个带脚注的句子[^1]，脚注标签支持 Unicode——对中文写作来说可以用语义化标签而不是干巴巴的数字，例如[^胆结石]；同一标签也可以重复引用[^1]。

[^1]: 数字标签的脚注定义。

[^胆结石]: Unicode 标签的脚注定义，与 vuepress-theme-hope 行为一致。
```

## 图片

相对路径图片在构建期复制到 `assets/img/` 并以内容 hash 命名，src 按页面深度重写，部署到任何子路径都不会断链。独占一段的图片会升级为 `<figure>`，alt 文本成为 figcaption；段落内混排的行内图片保持原样。

本地图片（png/jpeg/gif/webp/svg）构建期自动探测固有尺寸并注入 `width`/`height` 属性，浏览器在字节到达前预留版面（防 CLS）；markdown 图片语法与 raw HTML 的 `<img>` 都生效，已显式写 `width`/`height` 的图片、外链与 public 根路径 src 保持原样。

![Absolute Press 示意图](./assets/demo.svg)

**源码：**

```md
![Absolute Press 示意图](./assets/demo.svg)
```

段落内的行内图片不升级 figure：文字 ![inline](./assets/demo.svg) 图片混排。

**源码：**

```md
段落内的行内图片不升级 figure：文字 ![inline](./assets/demo.svg) 图片混排。
```

图片尺寸两种写法都支持：`![alt](src =宽x高)`（尺寸写在括号内、src 后面）与 `![alt =宽x高](src)`（尺寸写在 alt 侧），宽或高可省略。

![指定尺寸](./assets/demo.svg =120x60)

**源码：**

```md
![指定尺寸](./assets/demo.svg =120x60)
```

![alt 侧尺寸 =120x60](./assets/demo.svg)

**源码：**

```md
![alt 侧尺寸 =120x60](./assets/demo.svg)
```

`=` 后需要紧跟尺寸；不是尺寸的 `=` 后缀（如 `![a =wide]`）会原样保留在 alt 文本里。`![alt|300x200](src)` 的 obsidian 写法不支持。外链图片原样保留并自动加 lazy loading：

![外链图片](https://github.com/github.png)

**源码：**

```md
![外链图片](https://github.com/github.png)
```

需要点击放大的截图用 ZoomedImg island，见 [Islands](./islands.md#zoomedimg)。

## 表格

| 特性     | 状态 |                                                备注 |
| :------- | :--: | --------------------------------------------------: |
| 容器     | 支持 | tip/warning/danger/caution/error/info/details/right |
| tabs     | 支持 |                     `@tab` 标记，code-tabs 为代码组 |
| 死链检查 | 支持 |                              仅 `./` `../` 相对链接 |

**源码：**

```md
| 特性     | 状态 |                                                备注 |
| :------- | :--: | --------------------------------------------------: |
| 容器     | 支持 | tip/warning/danger/caution/error/info/details/right |
| tabs     | 支持 |                     `@tab` 标记，code-tabs 为代码组 |
| 死链检查 | 支持 |                              仅 `./` `../` 相对链接 |
```

## 站内链接与死链检查

`./` `../` 相对链接在构建期 resolve，失败即构建报错。resolve 顺序：`./x` → `./x.md` → `./x/index.md` → `./x/README.md`。本页故意混用各种写法：

- 显式 md 后缀：[快速开始](./getting-started.md)
- 无后缀（命中 `./configuration.md`）：[配置参考](./configuration)
- 目录式（命中目录索引）：[指南目录](./) 与 [组件岛](./islands)
- 跨目录向上：[站点首页](../index.md)
- 跨 locale：[英文版快速开始](../en/guide/getting-started.md)
- 带锚点：[配置参考的基础字段](./configuration.md#基础字段)
- 本页锚点：[数学公式](#数学公式)
- 外链（不参与 resolve）：[Solid.js](https://www.solidjs.com/)

**源码：**

```md
- 显式 md 后缀：[快速开始](./getting-started.md)
- 无后缀（命中 `./configuration.md`）：[配置参考](./configuration)
- 目录式（命中目录索引）：[指南目录](./) 与 [组件岛](./islands)
- 跨目录向上：[站点首页](../index.md)
- 跨 locale：[英文版快速开始](../en/guide/getting-started.md)
- 带锚点：[配置参考的基础字段](./configuration.md#基础字段)
- 本页锚点：[数学公式](#数学公式)
- 外链（不参与 resolve）：[Solid.js](https://www.solidjs.com/)
```

带其他扩展名的相对链接（如 `./assets/demo.svg`、`../rss.xml`）按资源 URL 原样透传，不做 md resolve。

裸相对链接（无 `./` 前缀，如 `[x](guide/a.md)`）不参与上述机制：既不重写为站内路由，也不进死链检查，会原样产出指向 `.md` 的链接。站点配置 `strictLinks` 控制对它们的报告力度（默认 `'warn'` 构建时列出清单，`'error'` 直接构建失败，`'off'` 静默），见[配置参考](./configuration.md#strictlinks)。站内链接请始终带 `./` 或 `../` 前缀。

## HTML 透传

`html: true`，未知 HTML 原样透传：<span style="color: var(--c-accent)">行内 HTML 片段</span>。`<template #xxx>` 与 vue 组件语法也按未知 HTML 透传（迁移时需逐页改造，见[迁移指南](./migration.md)）。

**源码：**

```md
`html: true`，未知 HTML 原样透传：<span style="color: var(--c-accent)">行内 HTML 片段</span>。`<template #xxx>` 与 vue 组件语法也按未知 HTML 透传（迁移时需逐页改造，见[迁移指南](./migration.md)）。
```

## 构建组件

构建组件（build component）与 [islands](./islands.md) 共用同一套 PascalCase 标签语法，但产物是构建期渲染好的最终静态 HTML：没有水合占位、没有客户端 JS，内容对 SEO 与无 JS 环境完全可见。适合内容完全由站点数据推导的挂件；需要交互的组件仍然走 islands。

内置清单（唯一事实源是 `src/shared/components.ts`）：

| 标签             | 说明                        |
| ---------------- | --------------------------- |
| `RecentArticles` | 最新文章 + 最近更新双栏列表 |

### RecentArticles

```md
<RecentArticles :latest="5" :updated="5" />
```

- `:latest` / `:updated`：两栏各自条数，须为非负整数，默认各 5；`0` 隐藏该栏，两栏全 0 时整个组件不产出
- 「最新」按 frontmatter `date` 降序；「最近更新」按 git 最后提交时间降序，排除没有 git 时间与从未单独提交过的页面（`updatedAt === createdAt`）
- 条目来自本 locale 的文章列表（locale 首页不算文章；frontmatter `feed: false` 的页面仍在列，与首页文章流口径一致）
- 链接是页面相对地址（与正文 markdown 链接同构），行首图标取 frontmatter `icon` 注册的 svg
- 列标题按页面 `<html lang>` 解析文案（中/英），空栏整体省略；组件不进 TOC

样式钩子（站点 CSS 可整体重绘）：`ap-recent`、`ap-recent__col`、`ap-recent__title`、`ap-recent__list`、`ap-recent__item`、`ap-recent__link`、`ap-recent__name`、`ap-recent__date`。

标签只能自闭合空用：构建组件没有 children 槽，写了内部 markdown 会收到构建警告并被忽略。

### 关闭内置组件

```ts
buildComponents: {
  disable: ['RecentArticles'],
}
```

被禁用的标签渲染为空并输出构建警告；未知名字在配置解析时报错并列出全部可用组件，详见[配置参考](./configuration.md#buildcomponents)。
