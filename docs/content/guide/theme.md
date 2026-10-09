---
date: 2026-10-03
category:
  - 指南
tag:
  - 主题
  - css
icon: solid/palette
---

# 主题定制

主题 chrome 是挂载到占位 DOM 的 Solid 组件：`#ap-nav`（导航栏）、`#ap-sidebar`（侧边栏）、`#ap-toc`（目录）、`#ap-content`（正文容器）。视觉定制走 CSS 变量，不需要改组件。

## 设计令牌 --c-*

`src/client/styles/theme.css` 定义亮暗双套令牌，亮色在 `:root`，暗色在 `html[data-theme='dark']`。自定义 island、站点级组件与注入样式只读这些变量，渲染在页面任意位置都能自动获得亮暗两套值：

| 变量          | 用途                                     |
| ------------- | ---------------------------------------- |
| `--c-accent`  | 强调色：链接、激活态、hover              |
| `--c-bg`      | 页面与组件底色                           |
| `--c-bg-soft` | 弱一层的底色：工具栏、表头、折叠块       |
| `--c-bg-mute` | 最弱一层：禁用底、滚动条、进度槽         |
| `--c-text`    | 主文本                                   |
| `--c-text-2`  | 次文本：辅助说明、meta、图标灰阶         |
| `--c-border`  | 边框、分隔线                             |
| `--c-code-bg` | 行内代码与代码块背景                     |
| `--c-shadow`  | 卡片/figure 阴影（完整 `box-shadow` 值） |

另有布局尺寸令牌 `--ap-nav-h` / `--ap-sidebar-w` / `--ap-toc-w` / `--ap-footer-h`，以及两个组件级令牌：`--ap-container-c`（各类容器的主题色，按类型在内部覆写）、`--ap-ln-gap`（代码块行号与正文的间距；行号宽度 `--ap-ln-w` 由渲染器按位数内联给出）。

用法示例：

```css
/* 站点自带的 island / 组件样式 */
.my-widget {
  color: var(--c-text-2);
  background-color: var(--c-bg-soft);
  border: 1px solid var(--c-border);
  border-radius: 0.5rem;
}

.my-widget__button {
  color: var(--c-accent);
  transition: color 140ms ease-out;
}
```

规则约定：

- **禁止硬编码颜色**：所有颜色/阴影都从上表取；需要带透明的强调色用 `color-mix(in srgb, var(--c-accent) 12%, transparent)`（框架内部同款写法）
- **禁止覆写 `--c-*` 本身**：换肤走[覆盖示例](#覆盖示例)；组件只读不写
- **动画 120–200ms ease-out**，`prefers-reduced-motion` 全站已统一处理，组件内无需重复声明
- **语义对应关系**：vuepress 组件映射见下面的别名表，迁移时把 `--vp-c-*` 换成对应 `--c-*` 即可

## DOM 挂载点与 class 钩子

页面外壳由构建期生成，主题 chrome 挂载到固定占位 DOM 上——站点 CSS 与脚本可以依赖这套结构（渲染器产出、主题消费，禁止改名）：

````html
```html
<div id="ap-nav" class="ap-nav"></div>
<!-- 导航栏 -->
<aside id="ap-sidebar" class="ap-sidebar"></aside>
<!-- 侧边栏 -->
<main id="ap-content" class="ap-main">…</main>
<!-- 正文（构建期已渲染完整 HTML） -->
<div id="ap-toc" class="ap-toc"></div>
<!-- 目录 -->
<script type="application/json" id="__AP_DATA__">
  …
</script>
<!-- 页面 payload -->
````

id 是脚本挂载锚，**CSS 请用同名类**（`ap-nav` / `ap-sidebar` / `ap-main` / `ap-toc` / `ap-footer`，客户端注入的主题 chrome 还会带 `ap-chrome`）：框架样式只用类选择器；id 特异性高，站点 CSS 一旦挂上它，后续任何框架升级的默认规则都压不过它。

- island 占位是 `<div data-ap-island="名称" data-props="…">`，激活前内部就是预渲染好的 HTML
- markdown 渲染器产出稳定 class：容器 `ap-container--<type>`（tip/warning/danger/caution/error/info/details/right）、页签 `ap-tabs` / `ap-tab` / `ap-tabs--code`、黑幕 `ap-heimu`（兼容裸 `.heimu`）、代码块 `ap-code`
- 客户端行为钩子：navbar 目录总览行 `ap-nav-index-row`（面板首行、指向目录 index 页的行，badge/分隔线样式归站点 CSS）；锚点跳转高亮 `ap-anchor-flash`（高亮保持到用户主动滚动）

本站的 navbar 就带着这个钩子的活例：悬停「指南」，面板首行的总览行打的是 `ap-nav-index-row`；带 index 的二级 folder 同理，其面板首行也是总览行。

覆盖这些钩子的样式时保持亮暗两套与移动端可用。

## --vp-c-* 兼容别名

为迁移保留 vuepress 变量别名，语义与 `--c-*` 一一对应（引用而非复制，亮暗自动联动）：

| vuepress 别名                                        | 指向          | 说明                            |
| ---------------------------------------------------- | ------------- | ------------------------------- |
| `--vp-c-accent`                                      | `--c-accent`  |                                 |
| `--vp-c-bg`                                          | `--c-bg`      |                                 |
| `--vp-c-bg-alt` / `--vp-c-bg-soft`                   | `--c-bg-soft` |                                 |
| `--vp-c-bg-mute`                                     | `--c-bg-mute` |                                 |
| `--vp-c-text` / `--vp-c-text-1`                      | `--c-text`    |                                 |
| `--vp-c-text-2` / `--vp-c-text-3`                    | `--c-text-2`  | vuepress 的三级文本收敛为次文本 |
| `--vp-c-border` / `--vp-c-divider` / `--vp-c-gutter` | `--c-border`  |                                 |
| `--vp-c-code-bg`                                     | `--c-code-bg` |                                 |

旧组件样式可以零改动接进来；新写的组件请直接用 `--c-*`。

## 暗色机制

- 暗色开关 = `html[data-theme="dark"]` 属性
- 用户选择持久化在 localStorage 的 `ap-theme` 键
- 页面头部有防 FOUC 脚本，首屏渲染前就确定主题
- Shiki 代码高亮是双主题（github-light / github-dark），随暗色通过 CSS 变量切换
- Mermaid、Giscus 等 island 也监听主题翻转重渲染

## 主题切换按钮

导航栏的切换按钮语义是「图标展示当前主题，文案描述将要执行的动作」：

- 亮色下显示太阳图标（按钮 aria-label 为「切换到暗色模式」）
- 暗色下显示月亮图标（aria-label 为「切换到亮色模式」）
- 首次访问无 localStorage 记录时跟随 `prefers-color-scheme`

## 侧边栏行为

sidebar 由目录树自动生成（数据在 `src/node/build/pages.ts`），交互契约：

- **文件夹行即索引页链接**：文件夹有 `index.md` 时，行名取其首个 h1、整行是进入该索引页的链接，且索引页不再作为子项重复出现；没有索引页的文件夹退化为纯标题行
- **chevron 独立收起/展开**：文件夹行尾的箭头按钮负责整棵子树的收起/展开（带 aria-expanded，可键盘操作），与行的导航职责分离
- **当前页自动展开**：进入某页时其所在路径自动展开一次；手动收起后不会被自动展开覆盖，跨页保持
- **任意多层嵌套**：目录嵌套多深，分组就嵌套多深，内外层可独立收起

本站的 `guide/advanced/deep` 是多层嵌套的现场示例。

## 级联层

页面上所有样式都放进[级联层](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer)，胜负由层序决定，与选择器强弱、加载顺序无关。层序在每页 head 里声明一次：

```css
@layer properties, theme, base, preflights, shortcuts, ap-base, ap-prose, default, ap-chrome;
```

| 层                                                           | 归属 | 内容                                                               |
| ------------------------------------------------------------ | ---- | ------------------------------------------------------------------ |
| `properties` / `theme` / `base` / `preflights` / `shortcuts` | uno  | `base` 是 reset，`preflights` 是全局基础规则，`shortcuts` 是工具宏 |
| `ap-base`                                                    | 框架 | 设计令牌、body 基础、锚点偏移                                      |
| `ap-prose`                                                   | 框架 | 正文 markdown 默认样式（零特异性，任何显式样式都能覆盖）           |
| `default`                                                    | uno  | 工具类                                                             |
| `ap-chrome`                                                  | 框架 | 组件、岛、布局                                                     |
| （不分层）                                                   | 站点 | 你的 CSS                                                           |

站点 CSS 不放进任何层，就恒胜全部框架样式——覆盖只需同名选择器甚至更低，不必叠 `html` 前缀、`!important` 或 id。两个注意点：

- 站点 uno 必须开 `outputToCssLayers: true`；否则站点 uno 的 reset 不分层，会压平框架排版
- 站点自定义 CSS 若经 uno preflights 注入，用 `outputToCssLayers` 的 `cssLayerName` 把 `preflights` 层输出为不分层：

```ts
// uno.config.ts
outputToCssLayers: {
  cssLayerName: layer => (layer === 'preflights' ? null : layer),
},
```

覆盖 `--c-*` 令牌时记得亮暗两套都写（令牌在层内，不分层的站点 `:root` 会连暗色块一起压掉，见下方覆盖示例的写法）。

## 覆盖示例

站点里加一小段 CSS 即可换肤（所有页面共享，建议同时给暗色一套值）：

```css
:root {
  --c-accent: #2f6fed;
}

html[data-theme='dark'] {
  --c-accent: #6ea1ff;
}
```

## 动画约定

- 时长 120–200ms，缓动 ease-out（如背景色 160ms、侧边栏抽屉 180ms）
- 全站尊重 `prefers-reduced-motion`
- tabs、heimu、details 等交互是纯 CSS 实现，不依赖 JS

## 响应式

- `<1024px`：侧边栏收起为抽屉（`transform: translateX` 切换）
- `≥1280px`：右侧 TOC 显示，滚动高亮
- 正文列宽 `max-width: 52rem` 居中

改完主题后记得检查亮暗两套与移动端表现，这是框架的行为准则之一。
