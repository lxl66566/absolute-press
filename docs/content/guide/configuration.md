---
date: 2026-10-02
category:
  - 指南
tag:
  - 配置
icon: gear
---

# 配置参考

站点配置通过 `absolutePress(defineSiteConfig({...}))` 传入，类型定义在 `src/shared/types.ts`（`SiteConfig`）与 `src/node/config.ts`（`AbsolutePressConfig`，构建层扩展）。本文按字段逐一说明，全部以实现为准。

## 基础字段

- `contentDir`（必填，string）：默认 locale 的内容根目录，相对项目根
- `title`（必填，string）：站点名，进入 `<title>`、RSS、sitemap
- `description`（必填，string）：站点描述，进入 SEO meta 与 RSS channel
- `hostname`（必填，string）：规范 origin（不带尾斜杠），用于 SEO og、sitemap 与 RSS 的绝对链接，如 `https://absolute-docs.pages.dev`
- `favicon`（可选，string）：站点 favicon，相对站点 public 根解析（语义同 `nav.logo`），如 `/favicon.svg`；构建期输出 `<link rel="icon">`，`type` 按扩展名推导（ico/png/svg/webp，其余扩展名不带 `type`），href 随页面深度加相对前缀，子路径部署不断链

## locales

```ts
locales: {
  en: { lang: 'en', label: 'English' },
}
```

- 默认 locale 固定占 contentDir 根，`<html lang>` 默认 `zh-CN`、切换器文案默认 `简体中文`，可用顶层 `lang` / `label` 覆盖
- 其余 locale 的内容放 `<contentDir>/<key>/`，路由加 `/en` 前缀
- 详见[多语言](./i18n.md)

## icons

```ts
icons: {
  rocket: '<svg xmlns="..." viewBox="0 0 512 512" fill="currentColor">...</svg>',
}
```

显式注册的图标表：key 是 frontmatter `icon` 的合法取值（构建期校验，未注册的 key 报错）；value 是完整 `<svg>...</svg>` 字符串，或裸 SVG 内部标记（客户端会包一层 24x24 svg）。navbar/sidebar/文章卡片消费这些图标。

## islands

```ts
islands: {
  Counter: 'docs/islands/Counter.tsx',
}
```

站点追加的自定义 island：PascalCase 标签名 → 相对项目根的模块路径。内置名单（Giscus/PasswordGate/ZoomedImg/Mermaid/G2Plot/ExpandableList）之外的能力入口，详见[Islands](./islands.md)。

## encrypt

```ts
encrypt: [
  {
    match: '/guide/secret', // 字符串全等匹配路由，或 RegExp.test
    passwords: ['docs-demo'],
    hint: '可选提示文案',
  },
];
```

客户端密码门规则数组：`match` 命中（字符串精确匹配或正则，避免 `/g` 标志）的页面正文被 PasswordGate island 包裹，输入 sha256 命中的密码后解锁，sessionStorage 按路由记住。中文等非 ASCII 路由直接写明文路径（构建期按解码后的路由匹配，正则看到的也是解码形式），不要写百分号编码。明文密码不会进入页面 payload（只输出 sha256 hex）。详见[加密](./encrypt.md)。

## algolia

```ts
algolia: {
  appId: 'XXX',
  apiKey: 'xxx',
  indexName: 'xxx',
}
```

配置后主题 chrome 挂载 Algolia DocSearch 搜索框，凭证进入页面 payload。

## giscus

```ts
giscus: {
  repo: 'owner/repo',
  repoId: 'R_xxx',
  category: 'General',
  categoryId: 'DIC_xxx',
}
```

配置后文章页尾部自动挂载 Giscus 评论 island（无需在 markdown 手写标签）；评论 iframe 主题随站点亮暗切换，不重载 iframe。

## googleAnalytics

```ts
googleAnalytics: 'G-XXXXXXX',
```

测量 ID 字符串，构建期注入 GA 脚本。框架会在 SPA 软导航后补发 `page_view`（首次加载由 GA 自身统计）；请在 GA4 数据流的增强衡量里关闭「基于浏览器历史事件的页面浏览」，否则软导航会被重复计数。

## nav

```ts
nav: {
  exclude: ['/hide'], // 从 navbar/sidebar 排除的路由前缀（页面仍会构建）
  logo: '/logo.jpg', // navbar（与移动端抽屉）的品牌图
  align: 'center', // 顶层导航条对齐：'left'（默认）| 'center'
  order: ['coding', 'hobbies'], // 顶层条目按内容目录名排序
  tweaks: { /* 按顶层内容目录名微调 navbar 条目，见下 */ },
  social: [
    { icon: 'github', url: 'https://github.com/owner/repo', title: 'GitHub' },
  ],
}
```

navbar 相关配置的归拢入口：导航树由内容目录自动生成，`nav.*` 只对生成结果整形。

- `exclude: string[]`：从 navbar/sidebar 排除的路由前缀（页面仍会构建）；frontmatter 契约里没有 hide 键，"存在但不进导航"是站点配置的事
- `logo: string`：navbar（与移动端抽屉）的品牌图，相对站点 public 根解析（`'/logo.jpg'` -> `public/logo.jpg`），客户端按页面深度拼接相对前缀
- `order: string[]`：navbar 顶层条目按内容目录名排序（与 `tweaks` 同一套 key）；未列出的目录与根级散页保持生成顺序，未知名字忽略
- `align: 'left' | 'center'`：navbar 顶层导航条的对齐方式，`'center'` 时在品牌区与右侧图标区之间自动等分剩余空间（默认 `'left'`）
- `tweaks: Record<string, NavbarDirTweak>`：按顶层内容目录名微调 navbar 条目。`label` 改写导航文字（sidebar 分组标题同步沿用）；`groups` 按组排版下拉面板（带 `text` 的组渲染为静态小标题，无 `text` 的组只固定成员顺序，未列出的成员保持生成顺序追加在后面）；`items` 整体指定面板条目（如从站点数据模块派生的分区树），构建期校验每个站内链接必须指向该目录下的页面，未被任何条目链接覆盖的生成成员仍会追加在后，优先级高于 `groups`；未显式给 `icon` 的条目回填所链页面的 frontmatter 图标。文件夹行（任意层级）导航到目录 index 页（板块名即总览）：带 `index` 标记的总览行渲染在面板首行（客户端打 `ap-nav-index-row` 钩子，样式归站点 CSS）——顶层面板的总览行由构建生成，二级 folder 的总览行由客户端在其面板首行合成，folder 行本身只负责展开；index 页 frontmatter `overview: false` 可退出总览行（folder 行仍指向该页，sidebar 不受影响）
- `social: { icon, url, title }[]`：导航栏右侧的社交图标按钮数组，渲染在 RSS 按钮之前，固定新标签页打开。`icon` 取 config `icons` 的 key，或内建品牌 key（`github` / `telegram` / `bilibili`），同名时 config `icons` 优先；`title` 用作 aria-label 与悬停提示

导航栏还固定渲染一个 RSS 按钮（链接 `/rss.xml`，base 自适应，title 走 i18n `nav.rss`）；RSS 始终生成，无需配置开关。

## sidebar

```ts
sidebar: {
  order: ['blog', 'guide'], // 顶层分组按内容目录名排序
  tweaks: {
    guide: ['getting-started', 'writing', 'markdown'], // 目录内成员顺序
    'guide/advanced': ['deep'], // 嵌套目录用相对内容根的路径做 key
  },
}
```

sidebar 由内容目录树完整生成，`sidebar.*` 只调整生成结果的顺序——条目可以重排，不能增删（隐藏页面走 `nav.exclude`）。

- `order: string[]`：顶层分组按内容目录名排序，语义与 `nav.order` 相同；散页与目录都在可排之列（散页取文件名 stem）。列出的排前（按配置顺序），未知名字忽略，未列出的保持生成顺序追加在后
- `tweaks: Record<string, string[]>`：单个目录内的成员顺序。key 是目录相对内容根的路径——顶层目录就是目录名，嵌套目录用 `/` 连接（如 `guide/advanced`）；value 是成员名的有序数组，成员名不带扩展名、相对该目录（页面取文件名 stem，子目录取目录名；目录 index 页不是成员——文件夹行本身链到它）。列出的成员排前（按配置顺序），未知名字忽略，未列出的成员保持生成顺序追加在后——顺序表只重排，不会让任何条目消失

## seo

```ts
seo: {
  image: '/og.png', // 分享卡片图，相对站点 public 根解析或绝对 URL
  author: { name: 'Alice', url: 'https://example.com/about' }, // JSON-LD 作者，url 可选
  exclude: ['/hide'], // 不进入 sitemap 且 robots.txt 追加 Disallow 的路由前缀
}
```

SEO head 选项：`image` 是分享卡片图，构建期输出 `og:image`（相对值如 `'/og.png'` 解析到站点 public 根，拼上 `hostname` 成绝对地址，与 `nav.logo` 同语义；`https://` 开头的绝对 URL 原样透传）并把 `twitter:card` 升级为 `summary_large_image`。未配置时输出 `twitter:card: summary`（无图卡片），不输出 `og:image`。`author` 是文章页 BlogPosting JSON-LD 的作者（schema.org Person），未配置或 name 为空则不输出 author 字段。`exclude` 让若干路由前缀保持不被抓取：不进 sitemap.xml，robots.txt 各追加一条 `Disallow`；页面仍会构建。加密页用 `encrypt` 即可，无需重复列在这里。每页的 `meta description` 取正文摘要（见 [SEO](./seo.md)），无需逐页配置。

## related

```ts
related: {
  depth: 1, // 1 | 2 | 3，默认 1
  maxNodes: 60, // 每页图的节点上限（含当前页），默认 60
  maxEdges: 240, // 每页成员连边上限，默认 240
  twoHopNodeLimit: 48, // 枢纽页回退阈值，默认 48
}
```

关联文章图的聚合范围：`depth` 是文章互引图的 BFS 层数——`1` 只收互引的一度邻居（默认），`2`/`3` 把两跳/三跳内的文章连同它们之间的真实连边一起收进来。非 1/2/3 的值构建期直接报错。

- 互引指文章之间存在任一方向的站内链接，同一对文章的多次互链会累加成 `refs`，决定边的粗细与邻居排序
- 载荷有上限保护（每页默认 60 节点、240 条成员连边，可用 `maxNodes`/`maxEdges` 调整，须为不小于 2/1 的整数），超出时按引用强度截断，depth 调大不会撑爆 payload；站点大、互链密时把两个上限一起调大
- `twoHopNodeLimit` 是多跳图的枢纽回退阈值：某页关联节点数（含自身）超过它时只渲染一度邻居，不再展开 `depth` 跳；一度星型本身超限时只保留互引最强的前若干个——密集枢纽页的画布标签会挤成一团，回退成可读的星型（它就是关联图的渲染节点数上限）
- 客户端图支持缩放/平移/拖节点/点击跳转，初始化自动 fit（有缩放上限，保证默认视图的文字紧凑可读），缩小时自动隐藏标签；交互见[Islands](./islands.md)

## code

```ts
code: {
  lineNumbers: true,         // 代码块行号，默认 true
  collapsedLines: 15,        // 超过 N 行折叠；null 显式禁用折叠，默认 15
  wrap: true,                // 软换行，默认 true
  copyLabel: '复制代码',      // 复制按钮的 aria-label/title，用于界面本地化
}
```

代码块呈现的站点级默认值（markdown 管线消费）：`collapsedLines` 用 `??=` 语义区分「未配置」与「显式 `null`」，写 `null` 才是关闭折叠。每个代码块可用围栏 meta 覆盖站点默认：`{1,3-5}` 行高亮、`title="..."`、`:collapsed-lines[=N]`、`:no-collapsed-lines`、`:wrap=true|false`，语法与演示见[Markdown 扩展](./markdown.md#代码高亮)。

## home

```ts
home: {
  feed: true, // 默认 true
  feedPerPage: 3, // 首页文章流每页篇数，默认 3
}
```

首页选项：`feed` 控制是否在各 locale 首页顶部渲染分页文章流。博客首页保持默认；文档/landing 式首页可设 `false`，让正文介绍（hero/特性/阅读路线）成为视觉主体。`feedPerPage` 是文章流每页篇数（客户端分页，取值须为不小于 1 的整数）；非默认值才写入页面 payload。

## archive

```ts
archive: {
  perPage: 10, // 分类/标签归档页每页篇数，默认 10
}
```

归档页选项：每个分类/标签归档页（`/category/*`、`/tag/*`）的文章分页大小，客户端分页，取值须为不小于 1 的整数；非默认值才写入页面 payload。

## urls

```ts
urls: {
  directoryIndex: 'slash', // 'slash' | 'bare'，默认 'slash'
}
```

URL 形态选项。目前只有一个键：目录索引页（`guide/index.md`）的 canonical 路由。

- `'slash'`（默认）：`/guide/`。GitHub Pages 的原生形态，零重定向
- `'bare'`：`/guide`。Cloudflare Pages 的原生形态（CF 会把 `/guide/` 308 到 `/guide`）

两个平台对对方形态都会补一次重定向（GH 把 `/guide` 301 到 `/guide/`，CF 反向），没有通吃的零跳转形态，按部署平台选即可。落盘文件名不受影响，永远是 `guide/index.html`。

## feed

```ts
feed: {
  rssLimit: 20, // rss.xml 收录的最新文章数，默认 20
}
```

订阅源选项：`rss.xml` 收录各 locale 最新文章的总数上限（`feed: false` 的页面始终排除），取值须为不小于 1 的整数。全文输出 RSS 需要把站内资源链接改写为绝对 URL，框架刻意不做（摘要 + 链接是订阅源的实用形态），可调的只有收录条数。

## footer

```ts
footer: {
  credit: '© 2026 Someone',
}
```

页脚：桌面端一行两栏，右侧固定「Powered by absolute-press」链接指向框架仓库。左侧署名行（桌面页脚与移动端抽屉底部共用）默认是 CC 图标 + 框架名；配置后整段替换为自定义纯文本（组件不解析 HTML，需要图标请走站点 CSS 或自定义 island）。留白字符串视为未配置。

## strictLinks

```ts
strictLinks: 'warn', // 'off' | 'warn' | 'error'，默认 'warn'
```

裸相对链接策略：正文里不带 `./` `../` 前缀的站内 markdown 链接（如 `guide/a.md`）既不会被改写为站内路由，也不参与死链检查，会原样产出指向 `.md` 的链接——几乎总是漏写前缀的笔误。

- `'warn'`（默认）：构建时列出文件、行号与链接，构建继续通过
- `'error'`：与死链同样直接构建报错，适合 CI 严格把关
- `'off'`：完全不提示

只影响构建期报告；dev 服务器不检查。语法细节见[Markdown 扩展](./markdown.md#站内链接与死链检查)。

## readingTime

```ts
readingTime: true, // 默认 true
```

阅读时长统计：构建期按正文估算——中文按字数（300 字/分钟）、英文按词数（200 词/分钟），混合文本线性合并；frontmatter、代码围栏与行内代码不计入。结果写入页面 payload 的 `page.readingTime`（整数分钟，向上取整，最小 1），供归档卡片等展示处选用；文章顶部 meta 行当前不渲染该值。设为 `false` 后 payload 不携带该字段。

## onScan

```ts
import type { SiteScanContext } from 'absolute-press';

onScan: (ctx: SiteScanContext) => ({
  pages: ctx.pages.map(page => ({
    route: page.route,
    date: page.createdAt,
    tags: page.frontmatter.tag ?? [],
  })),
}),
```

站点数据钩子：框架单遍扫描内容树，每轮扫描完成后、渲染前运行一次——dev 启动、构建、dev 结构变更 resync 与内容编辑都会触发。参数 `SiteScanContext` 是 `{ config, pages }`：`config` 是全量解析后的站点配置（`ResolvedConfig`），`pages` 是全部 locale 的页面清单，按配置 locale 顺序排列，类型可从 `absolute-press` 导入。

返回值会被 JSON 序列化进 `virtual:absolute-press/site-data` 虚拟模块（default export 即返回值），供站点 island 消费，消费方式见[Islands](./islands.md#站点-island-读取全站数据-site-data)。因此返回值必须 JSON 可序列化（`rawFrontmatter` 里的裸日期是 `Date` 对象，需要字符串时先自行 `toISOString`）；返回 Promise 会被 await。

动机：locale 目录归属、README/index 语义、frontmatter 规范化与未知键告警、git 时间都以框架扫描为准。消费方不必再自己 walk 目录、parse frontmatter、查 git 时间——在 `onScan` 里从 `pages` 派生站点数据，语义与框架天然一致；dev 下内容编辑触发新一轮扫描，数据自动刷新，无需重启 dev server（在 vite.config.ts 里自扫内容的老做法需要重启才能拿到新数据）。

`SiteScanPage` 字段（`import type { SiteScanPage } from 'absolute-press'`）：

- `filePath: string`：markdown 源文件的绝对路径
- `route: string`：带 locale 前缀的 clean 路由——叶子页 `/guide/a`、目录索引 `/guide/`（`urls.directoryIndex: 'bare'` 时为 `/guide`）、locale 首页 `/en/`、站点首页 `/`
- `relPath: string`：相对 locale 内容根的路径，posix 分隔符
- `locale: LocaleInfo`：页面所属 locale（`key` / `lang` / `label` / `prefix`）
- `frontmatter: PageFrontmatter`：框架识别键的规范化结果（六个键，语义见[页面级配置](#页面级配置-frontmatter)）
- `rawFrontmatter: Record<string, unknown>`：yaml 原生解析结果，自定义键在这里；裸日期是 `Date` 对象
- `createdAt: string | null`：frontmatter `date` 的 ISO 字符串，缺失或不可解析为 `null`
- `updatedAt: string | null`：git 最后提交时间的 ISO 字符串，不可用（如不在 git 仓库）为 `null`

## 构建层扩展字段（AbsolutePressConfig）

- `nav`：见上文
- `onScan`：见上文
- `entryListIslands: string[]`：复用 `@@@` 条目管线的站点 island 名单（名字必须已在 `islands` 注册）——构建期把这些 island 的 children 按 ExpandableList 同款规则拆成「标题 + meta + 正文」静态表格骨架，island 客户端接 `childrenHtml` 填充数据，见[Islands](./islands.md#站点-island-复用条目管线-entrylist)
- `code` / `readingTime`：见上文
- `islands` / `lang` / `label`：见上文

## vite 层

`absolutePress()` 之外仍是标准 vite 配置：`build.target` 建议 `esnext`；产物目录用 `build.outDir` 控制（本站输出到 `dist`）。UnoCSS 与 `vite-plugin-solid` 需要显式接入，模板见[快速开始](./getting-started.md#vite-config-ts)。

## 页面级配置（frontmatter）

frontmatter 只认六个键：`date` / `category` / `tag` / `icon` / `feed` / `overview`，语义见[写作指南](./writing.md#frontmatter-六个键)。`feed: false` 的页面退出 RSS（文章流仍收录）。
