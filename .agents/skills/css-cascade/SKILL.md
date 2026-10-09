---
name: css-cascade
description: absolute-press 框架的 CSS 级联层契约：ap-base / ap-prose / ap-chrome 三层 + uno 五层在 shell head 一次定序，站点 CSS 不分层即恒胜。凡改 src/client 下任何 CSS、加组件/岛样式、改 uno.config 或 shell，或排查「组件样式被系统 CSS 覆盖 / 工具类失效 / 站点覆盖不生效」，先读这个。
---

# CSS 级联契约：@layer 三层 + 零 id + 零特异性 prose

框架样式与 uno、站点样式同处一个文档，历史上靠特异性对决分胜负（`#ap-content li` 压 `space-y-*` 工具类、popover 里 prose h1 外边距漏出），每次新组件都要重打一场。现行契约用**级联层**一次性消灭这类对决：胜负由层序决定，与选择器强弱、import 顺序、文件拆分全部无关。

## 层序（唯一真相源）

shell head 内联声明（src/node/build/shell.ts `LAYER_ORDER`），先于任何 stylesheet：

```
@layer properties, theme, base, preflights, shortcuts, ap-base, ap-prose, default, ap-chrome;
```

| 层 | 归属 | 内容 |
| --- | --- | --- |
| properties / theme / base / preflights / shortcuts | uno（`outputToCssLayers: true`） | base = preset-wind4 reset；preflights = 框架指针光标等自定义 preflight；shortcuts = 工具宏 |
| ap-base | 框架 styles/theme.css 头部 | `--c-*` tokens（含 dark 块）、body 基础、锚点 scroll-margin、全局 reduced-motion 覆盖 |
| ap-prose | 框架 markdown 正文默认样式（theme.css、content.css） | 全部 `:where(.ap-main)` 作用域，零特异性 |
| default | uno utilities | 工具类：显式类名压过正文默认 |
| ap-chrome | 框架组件/岛/布局样式（其余全部框架 CSS） | shell 布局、sidebar、TOC、各岛 |
| （不分层） | 站点 CSS | 不分层 = 恒胜，无需任何特异性技巧 |

关键序关系：uno reset（base）压不过 prose（修好「reset 吃掉排版」）；utilities（default）压过 prose（修 80c0ae7 卡片间距）；chrome 压过 utilities 与 prose（组件内不被工具类/正文规则误伤）。

## 硬约束（css-contract.test.ts 在 pnpm verify 强制）

1. 框架 CSS **一律入层**：只允许 `ap-base` / `ap-prose` / `ap-chrome` 三个层名，文件顶层不允许裸规则。
2. **禁 id 选择器**：`#ap-content` 等只作 JS 挂载锚（dom.ts getElementById），CSS 挂钩是类 `ap-main` / `ap-nav` / `ap-sidebar` / `ap-toc` / `ap-footer` / `ap-chrome`（shell 标记同时带 id+class）。
3. ap-prose 层内规则**必须含 `.ap-main`**（`:where(.ap-main)` 包裹，零特异性）。
4. **禁 `!important`**，白名单仅 theme.css 的 shiki（打内联 style）与 reduced-motion 全局块（最早层的 important 才能赢后续 important）。
5. 组件间距用**父级 flex/grid gap**，不用兄弟 margin——结构上免疫 `li { margin: 0 }` 类 prose 重置。

## 怎么加规则

- **markdown 正文默认样式**（标题、列表、表格、链接……）：进 ap-prose，`:where(.ap-main)` 作用域，预期「不敌任何显式样式」。
- **组件/岛/布局样式**：进 ap-chrome，直接裸类选择器（`.ap-xlist__table`），**不需要** `#ap-content` 前缀、`:where()`、双写规则——层序已保证压过 prose 与 utilities。
- **岛内嵌 markdown body**（ExpandableList 展开行、term popover 正文）：正文规则照常命中；边缘 trim（首/末子元素外边距）写在 chrome 层，如 `.ap-xlist__body-inner > :first-child { margin-top: 0 }`。
- **新组件间距**：`display: grid; gap: …` 放父级；参考 `.ap-cards`（theme.css）。
- **新的 CSS 文件**：整体包进 `@layer ap-chrome { … }`；测试自动收编。

## 站点侧（弱契约，文档在 docs/content/guide/theme.md）

- 站点 CSS 保持**不分层**即恒胜一切框架规则；覆盖只需同名选择器或更低，`html .foo` 兜底都不必再写。
- 站点 uno 必须开 `outputToCssLayers: true`；站点自定义 CSS 若经 uno preflights 注入，用 `outputToCssLayers.cssLayerName: layer => layer === 'preflights' ? null : layer` 把 preflights 层输出为不分层（作者博客即此形态）。
- 覆盖 `--c-*` tokens 时亮暗两套都要给（tokens 在层内，未分层的站点 `:root` 会同时压过暗色块）。
- 站点 CSS 里允许 id 选择器（不受框架测试约束），但不推荐沿用 `#ap-content` 前缀——`.ap-main` 是等价且无历史包袱的钩子。

## 排错速查

- 「工具类被框架样式压掉」→ 框架规则误入 ap-chrome 之上的语义（不该赢的放进了 chrome）；utilities 在 default 层，chrome 本来就该赢——把该样式改用类名约定或挪层。
- 「站点覆盖不生效」→ 站点 CSS 被包进了某个层（uno outputToCssLayers 的 preflights 陷阱，见上）。
- 「正文排版全没了」→ 站点 uno 未开 outputToCssLayers：reset 不分层，压过全部框架层。
- 「暗色模式 token 不生效」→ 站点覆盖只写了亮色一套。
- 层序变化必须同时改 shell.ts `LAYER_ORDER` 与本文件表格；css-contract 测试只校验集合，不校验次序语义。
