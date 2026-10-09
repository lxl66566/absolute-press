---
date: 2026-10-08
icon: solid/lightbulb
category: [设计]
tag: [ssg]
---

# 为什么又造一个

静态站点生成器已经很多，这个框架的存在理由很具体：作者本人的博客要从 [vuepress-theme-hope](https://theme-hope.vuejs.press/) 迁走，而现有选项都差一块。这篇讲清楚它解决什么问题、和相邻方案差在哪、付出了什么代价。

## 起点：一次迁移

迁移动机有三条，都来自长期使用 VuePress 的实际感受：

- 不想再写 Vue 组件。作者最熟悉 SolidJS，且它的运行时性能在主流框架里属于第一梯队，组件模型也简单。
- VuePress 的内部样式和行为有不少改不动的地方。主题-hope 这类大主题尤其如此：想深度定制时，绕过框架的成本高过自己掌控框架。
- 构建慢、加载慢。全量构建和页面关键路径体积都不符合预期。

结论：用一个自己完全掌控的框架，把需求全部做成 builtin，比继续在别人的主题上打补丁省事。框架的全部需求就来自这一个真实站点。

## 定位

absolute-press 是 MPA + islands 的静态博客框架，不是通用站点生成器。定位上的几条约定：

- 目录即配置。导航、侧边栏、分类/标签归档、首页文章流、TOC 全部由内容目录结构推导，`index.md` 就是目录索引页。frontmatter 只认 `date / category / tag / icon / feed / overview` 六个键。
- 一切能在构建期解决的都在构建期解决。markdown 渲染、容器与 tabs、Shiki 高亮、KaTeX、死链检查、git 最后编辑时间、RSS/sitemap 全部发生在构建期，产物是纯 HTML。
- 页面交互只交给 islands。markdown 正文里直接写 `<MyIsland prop="str" :num="1">内部 markdown</MyIsland>`，构建期预渲染成占位标记，浏览器里只有这些节点执行代码，正文始终是纯 HTML。

## 与 Astro 的差异

Astro 是理念上最接近的框架：同样 islands，同样基于 Vite 的静态优先。差异在四条：

- 内容约定不同。Astro 的导航、归档、TOC、文章流靠主题和集成补齐，是通用生成器的必然形态；absolute-press 里这些全是 builtin，目录结构直接决定它们。
- islands 写法不同。Astro 用 `.astro` DSL 给组件标注 hydration 策略，组件清单由页面结构决定；absolute-press 的组件写在 markdown 正文里，带 props、内部还能嵌 markdown，正文不引入 MDX 或任何组件语法。
- markdown 增强不同。Astro 走 remark/rehype 生态，容器语法、代码增强、数学公式要自己挑插件拼管线；absolute-press 开箱即得，且语法规则刻意与 VuePress 逐字保持一致，方便从 VuePress 迁移。
- 定制方式不同。Astro 的深度定制通常从拷一份主题开始；absolute-press 暴露的是一组稳定契约——`#ap-*` 挂载点、`ap-container--*` 渲染器 class、亮暗双套 CSS 变量，站点在契约外面包一层自己的样式和组件。

## 与 VuePress / VitePress 的差异

VuePress 和 VitePress 是同一类问题的 Vue 答案：markdown 加组件的内容站框架。除了上面迁移动机里的三条，还有两个结构性差别：

- 它们是 SPA。absolute-press 是 MPA，每页输出独立 `.html`，无 JS 也可读，首次请求只需 2 RTT。
- 它们的 markdown 组件语法（Vue 单文件组件、frontmatter 里的组件块）把组件模型织进了内容格式。absolute-press 的 markdown 保持纯 markdown，island 标签在构建期就处理掉了。

## 性能实测

本仓库文档站（22 页、中英双 locale、Windows）的实测数据：

- 全量构建约 2s；dev 冷启动到首字节约 2.2s。
- 页面关键路径约 65KB gzip（entry JS 55KB + CSS 10KB）。Mermaid、G2Plot、Algolia 搜索、图片放大、关联文章图全部动态按需加载；KaTeX 样式只注入有公式的页面。
- 渲染缓存双策略：构建按 mtime 增量复用，dev 按 watcher 事件单页失效，未变更的页面不重复渲染。

这些数字的前提是范围收窄：一个博客框架只需要处理博客的规模，缓存、按需加载、双主题高亮都可以按这个规模设计，不需要为通用场景留余量。

## 代价

取舍必须连同代价一起说：

- MPA 没有 SPA 式的跨页过渡。补偿手段是 Speculation Rules：hover 预取目标页 HTML，pointerdown 即开始预渲染，导航激活时页面通常已经备好。Safari 和 Firefox 忽略这个 script 类型，退回普通全页加载，行为仍然正确。
- islands 生态远小于 Astro。框架内置 Giscus、Mermaid、G2Plot、图片放大、可展开表格、加密门这几个组件，其他都要站点自己在 config 里注册 Solid 组件。
- 目录即配置意味着信息架构必须能映射成目录树。需要多套视图（同一批文章按不同维度组织）的站点，这个模型装不下。
- 框架没有插件系统。markdown 管线和构建流程的扩展点就是源码本身，这也是「源码直出」（npm 包直接发布 `src/`，由宿主的 Vite 加载 TS）这个决定的配套取舍。
