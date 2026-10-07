---
date: 2026-10-03
category:
  - 指南
tag:
  - faq
icon: star
---

# FAQ

按主题整理的高频问题；迁移相关的问题同时见[迁移指南](./migration.md)。

## 迁移与兼容

### 从 vuepress-theme-hope 迁移，正文真的零改动吗

正文语法（容器、tabs、代码组、KaTeX、脚注、黑幕、行高亮等）逐字兼容，URL 与中文锚点也保持一致。需要动手的只有两类：

- `<template #xxx>` 与 vue 组件语法按未知 HTML 原样透传（框架不兼容 vue），要逐页改写成 island 或 markdown 语法
- 主题层面的自定义（自定义组件、样式覆写）改用 CSS 变量与挂载点 DOM 实现，见[主题定制](./theme.md)

完整清单与迁移步骤见[迁移指南](./migration.md)。

### frontmatter 里的 `order`、`sticky` 等键怎么不生效

frontmatter 只认 `date` / `category` / `tag` / `icon` / `feed` 五个键，其余被忽略。导航排序、置顶等能力以站点配置与目录结构表达（如 `nav.exclude` 控制「存在但不进导航」）。

### 旧文章里的密码保护还能用吗

语义变了：theme-hope 是构建期真加密，Absolute Press 是**客户端密码门**——正文完整随 HTML 下发，只是被 CSS 隐藏，输入密码（sha256 比对）后展开。适合防误入，不适合真正的机密内容，详见[加密](./encrypt.md#边界重要)。

## 已知边界

### vue 组件语法为什么原样显示在页面上

markdown 管线开着 `html: true`，未知 HTML 一律透传。`<MyComp />` 不在 island 名单里时按原样输出。解法：把它实现成 island 并在站点配置 `islands` 注册（自定义）或使用内置的 Mermaid / G2Plot / ZoomedImg 等，见[Islands](./islands.md)。

### Mermaid / G2Plot 页面加载慢

两者的 chunk 较大（mermaid 还含 elk 布局引擎），框架按需懒加载：页面没有图表就完全不下载，有图表也只在用到时拉取。这是刻意的体积取舍；对图表极多的页面，首图出现前的等待无法避免。

### 加密页面为什么能在源码里看到内容

同上，客户端密码门不是真加密，设计如此。真机密内容请在构建前拆分，不要放进 contentDir。

### 关联文章图为什么只有几篇文章

默认只聚合**互引的一度邻居**。站内文章之间互相链接越多，图越丰富；想要更大的图可把 `related.depth` 调到 2 或 3（BFS 层数；节点/边数上限保护 payload，可用 `maxNodes`/`maxEdges` 调整），见[配置参考](./configuration.md#related)。

### 图片尺寸两种写法都支持吗

支持：`![alt](src =300x)`（括号内、src 后）与 `![alt =300x](src)`（alt 侧）都由 @mdit/plugin-img-size 解析，`宽x高` 任意一侧可省略；`![alt|300x200](src)` 的 obsidian 写法不支持。详见[Markdown 扩展](./markdown.md#图片)。

### ArticleCard 上的 icon 为什么不是图形

首页文章卡片的 icon 目前渲染为文本 chip；navbar/sidebar 里注册的 svg icon 是完整图形。这是已知边界，后续版本改进。

## 构建与部署

### 构建报 dead link 错误怎么办

报错会列出源文件与原始链接。常见原因：文件被移动/重命名后旧链接没更新；目录式链接写错（`./x` 会依次尝试 `./x.md` → `./x/index.md` → `./x/README.md`）。死链检查只针对 `./` `../` 相对链接，外链与纯锚点不参与。

### 代码块想全局改行号/折叠/换行行为

站点配置 `code` 一处改默认值（`lineNumbers` / `collapsedLines` / `wrap`），单个代码块用围栏 meta 覆盖（`:wrap=false`、`:collapsed-lines=N` 等），见[配置参考](./configuration.md#code)。

### 中文路径的页面部署后 404

检查主机是否在查找文件前对请求路径做 percent-decode——主流静态主机（Cloudflare Pages、Netlify、GitHub Pages、nginx）都默认解码，框架落盘的也是解码后的文件名，正常直接可用；自建网关/CDN 转发层要确认没有二次编码。其余部署问题见[部署指南](./deploy.md)。

### 多语言站点缺译页面怎么办

不需要两边页面一一对应：某 locale 缺一页就不写那个文件，该页在该语言下不存在，互链按实际文件写。UI 文案未知 locale 回退中文，详见[多语言](./i18n.md)。
