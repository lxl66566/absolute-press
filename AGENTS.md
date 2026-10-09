---
description: coding
mode: primary
temperature: 0
---

# absolute-press — SolidJS 静态博客框架

MPA SSG + islands 架构，面向熟练开发者。阅读 README.md 了解更多。

## 技术栈

- solid-js@next（2.0 RC，两段式 `createEffect(compute, fn)`）+ vite-plugin-solid@next；JSX runtime 在 `@solidjs/web`（tsconfig paths 映射 `solid-js/jsx-runtime`）
- UnoCSS preset-wind4；oxlint + oxfmt；vite v8.x + vitest + pnpm
- markdown 生态用 @mdit/plugin-\*

## 行为准则

- 遵循原子化 commit；commit msg 英文、无 emoji、不引用外部文档章节
- 少造轮子；少写重复代码，抽离可复用组件并考虑向后扩展性
- 编译期检查优先：枚举/判别联合，禁 `any`、`as unknown`
- 简体中文交流；代码内英文注释，简洁；失败的尝试/bug 修复/设计考量用简洁注释记录；不删关键注释和日志
- 注释和文档不允许出现任何废话
- 简单函数不写单测，易错部分要多写
- 一切修改考虑 i18n、light/dark theme、移动端兼容
- TS 动态 import 仅允许字符串字面量路径，禁止变量路径
- 仅考虑现代浏览器

## UX 偏好

- FA/SVG 图标不做任何动效，不加 bounce 或循环动画
- 文章顶部 meta 不展示阅读时长
- ExpandableList 必须保持表格样式、行可展开并有 boarder 展开提示
- navbar 下拉必须兼容超长条目：面板限高约半屏（内部滚动；.ap-nav-drop 的 CSS 50vh 与 placeFlyout 的 JS 上限各一份，改动需同步），任何层级不得超出视口；任何交互状态下不得出现横向滚动条；面板行（含 button 行）撑满行宽，使嵌套箭头统一居右
- navbar 文件夹行链到目录 index（板块名即总览，与 sidebar 分组行同契约）；顶层条目的面板保留带 `index` 标记的总览行（`.ap-nav-index-row` 钩子，badge/分隔线样式归站点 CSS），嵌套文件夹行面板内不重复 index；tweak `items` 的 curated 条目构建期校验路由，未显式给 icon 的行回填所链页面的 frontmatter 图标
- 图标与文字必须垂直对齐（meta 行、sidebar 条目、navbar 图标组等所有图文组合处）
- sidebar 按目录结构自动生成，列表长可接受；当前文章必须在 sidebar 可见：祖先自动展开，超出视口时自动滚动定位；宽度可拖拽调整（lg+ 右缘 resizer，localStorage `ap-sidebar-w` + FOUC 脚本防闪烁，方向键微调，双击复位）
- 滚动条分级：页面主体保持原生；sidebar 用细滚动条
- TOC spy 高亮对齐视线处章节：观察区顶边贴导航栏下缘（-64px），不能锚在 20vh 滚动偏移上——否则紧凑章节页（如博客日志）的高亮会超前阅读位置数条
- TOC 高亮行被裁剪时用 `scrollIntoView({block:'nearest', behavior:'instant'})` 即时最小滚动进可视区，刻意不用平滑滚动（动画追不上连续滚动会让高亮溜出视口）；不牵连页面滚动依赖 #ap-toc 全高 fixed 的前提
- TOC 折叠组展开动画期间行位置不可信：transitionend 一次精确重瞄准，截止时间兜底（reduced-motion 无过渡可等）
- 关联图节点数超过阈值时只展示一度关联，否则展示两度
- 移动端顶栏仅一个汉堡按钮；抽屉按目录树分层折叠，默认只展示第一层，可无限展开并包含全部文章
- 桌面端 footer 是内容列宽的紧凑两栏行：左侧署名（默认 CC 图标 + 框架名，footer.credit 可整段替换为纯文本），右侧固定 Powered by 框架名链接指向框架仓库；不 sticky、不挤占 sidebar/TOC，边框与高度在 #ap-footer、文字与内容列对齐；移动端不出 footer，署名放抽屉 footer 底部；不放社交图标与最后更新；评论区不加标题；不做上/下篇导航（由关联文章组件承担）；不做时间轴归档页
- details 容器 summary 文字垂直居中、上下留白对称（需覆盖共享 \_\_title 的下边距）

## 写作准则

docs/ 是本框架的门面与参考文档。

- 禁止 `不是-而是` 语句，禁止把英文翻译为不常用的汉语（例如 _水合_ 等）。话语清晰。
- 同时修改中英文文档。

## 架构

```
src/shared/    数据契约 types.ts（改动需慎重，全链路依赖）+ islands.ts（内置 island 名单）
src/node/      构建层：config.ts(defineConfig) / markdown/(markdown-it 管线) / build/(vite 插件、SSG、链接解析、git 时间、RSS/sitemap、归档聚合)
src/client/    浏览器侧：dom.ts(mountComponent) / runtime/(entry、island 水合、photoswipe) / theme/(chrome UI) / islands/(内置 islands) / graph/(关联图) / styles/theme.css
docs/          官方文档站（vite.config.ts 接入 absolutePress() 指向 docs/content，兼特性演示场）
```

- **渲染**：构建期 md → 静态 HTML 套 shell（SEO/og/katex css/防 FOUC 脚本/payload JSON）；客户端挂载主题 chrome 到 `#ap-nav/#ap-sidebar/#ap-toc/#ap-content`，水合 `[data-ap-island]`。正文不参与水合
- **base 自动检测**：按页面深度生成相对前缀（`''`/`'../'`…），所有资源与站内链接用它拼接，禁止绝对路径假设
- **island**：md 内 `<Tag prop="s" :num="1">内部 md</Tag>` → 构建期预渲染 + 客户端水合；内置 Giscus/PasswordGate/ZoomedImg/Mermaid/G2Plot（名单在 shared/islands.ts，runtime 注册表有编译期覆盖检查）；站点经 config `islands` 追加。island 仅块级使用
- **DOM class 契约**（renderer 产出、theme 消费，禁止改名）：`ap-container--<type>`、`ap-tabs`/`ap-tab`、`ap-heimu`（兼容 `.heimu`/`heimu`）、`ap-code`、占位 `data-ap-island`
- **路由**：canonical 是无扩展名 clean URL（`x.md` → `/x`，目录 index → `/dir/`，可用 `urls.directoryIndex: 'bare'` 切 `/dir`），落盘文件保持 `x.html`/`dir/index.html` 不变；encrypt match、canonical、sitemap、payload 全部消费 clean 形态
- **死链**：`./` `../` 相对链接构建期 resolve 失败即报错；resolve 语义 `./x` → `./x.md` → `./x/index.md` → `./x/README.md`
- **主题**：CSS 变量 `--c-*`（亮暗双套，theme.css）+ `--vp-c-*` 兼容别名；暗色 = `html[data-theme="dark"]` + localStorage `ap-theme`；动画 120–200ms ease-out，尊重 prefers-reduced-motion
- **CSS 级联契约**（详见 .agents/skills/css-cascade/SKILL.md，css-contract.test.ts 强制。shell head 一次声明层序 `properties, theme, base, preflights, shortcuts, ap-base, ap-prose, default, ap-chrome`（shell.ts `LAYER_ORDER`）；框架 CSS 一律入层且层名仅限 ap-base/ap-prose/ap-chrome；禁 id 选择器（`#ap-*` 只作 JS 挂载锚，CSS 挂钩是类 `ap-main/ap-nav/ap-sidebar/ap-toc/ap-footer/ap-chrome`）；ap-prose 一律 `:where(.ap-main)` 零特异性；禁 `!important`（白名单：theme.css shiki 与 reduced-motion）；组件间距用父级 gap 不用兄弟 margin；uno 必须 `outputToCssLayers: true`
- **i18n**：默认 locale 在 contentDir 根，其余在 `<contentDir>/<key>/`（路由加前缀）；UI 文案在 theme/i18n/，zh 为 shape 真相源
- **加密**：客户端密码门（sha256 比对，sessionStorage 记住），非真加密，设计如此
- **frontmatter** 只认 `date/category/tag/icon/feed/overview`；icon 必须是 config `icons` map 的 key（svg 字符串），构建期校验

## 验证

```bash
pnpm verify                                   # fmt+lint+tsc+vitest，提交前必过
pnpm build                                    # 文档站构建
pnpm exec playwright test                     # e2e（先构建文档站）
```

内嵌/无头预览面板不渲染帧时，IntersectionObserver / rAF / CSS 过渡全部冻结、定时器重度节流——不能据此判定 spy/reveal 失效；验证高亮逻辑用点击 TOC 链接驱动（navigate 直设 active，不依赖 IO）。

## 已知边界

- `<template #xxx>` 与 vue 组件语法按未知 HTML 透传（迁移时逐页改造，框架不兼容）
- `<Mermaid>`/G2Plot 懒加载 chunk 较大（mermaid 含 elk），仅用到时加载
- 关联图只含一度邻居；ArticleCard 的 icon 仍是文本 chip
- solid-js 2.0 为 RC，升级时复查 createEffect 两段式语义与 jsx-runtime 映射
