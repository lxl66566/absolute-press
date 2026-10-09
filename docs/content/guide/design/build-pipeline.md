---
date: 2026-10-08
category:
  - 设计
tag:
  - 构建
  - markdown
icon: solid/diagram-project
---

# 构建管线

本文讲 markdown 渲染与站点构建的实现：markdown-it 管线、中文锚点、死链检查、git 时间、摘要与 RSS。代码在 `src/node/markdown/`（渲染）与 `src/node/build/`（站点装配），整体架构见[架构](./architecture.md)。

## 为什么用 markdown-it + @mdit

框架的迁移目标是把一个 VuePress 2 博客搬过来，语法必须逐页对齐。VuePress 2 的 markdown 层就是 markdown-it 加 @mdit 插件家族，选同一套引擎意味着容器、frontmatter、锚点、图片尺寸这些行为可以直接对齐上游语义，迁移成本收敛为逐页改写内容，不用逐个语法点翻译。

`src/node/markdown/renderer.ts` 的插件栈基本是 @mdit 全家桶加少量自研规则：

```ts
md.use(katex);
md.use(footnote);
md.use(tasklist);
md.use(mark);
md.use(legacyImgSize);
md.use(imgSize);
```

remark/rehype 是 AST 管线，生态围着 MDX 转，插件语义与 VuePress 对不上；本框架需要的「渲染期注入链接解析、按 token 改写出力」用 markdown-it 的 token 流表达更直接，自研部分（heimu、tabs、条目拆分）都是规则级注入，不动核心。

`createMarkdownRenderer` 保持纯函数：不碰文件系统，链接与图片解析经 `options.resolveLink / resolveImage` 注入（`src/node/build/assets.ts` 的 `LinkResolver`），代码高亮选项由站点配置显式流入。渲染器可以脱离站点单测。

## 中文锚点 slugify

`src/node/markdown/slugify.ts` 逐行移植自 `@mdit-vue/shared` 的 slugify，也就是 VuePress 2 喂给 markdown-it-anchor 的算法：NFKD 规范化、剥离组合音符与控制字符、特殊字符连段折叠成单个 `-`、去首尾 `-`、数字开头补 `_`、转小写。中文不落任何规则，原样保留。

逐字兼容的理由是外链锚点：搜索引擎收录、别的文章的引用、评论里贴的 `#某节` 链接都带旧锚点，算法差一个字符就是一批失效链接。

同名标题的去重也按 markdown-it-anchor 语义：`Slugger` 类每次渲染维护一个已见集合，重名追加 `-1`、`-2`。整个页面（含 island 内部片段）共享同一个 `Slugger`，island 里的标题与正文标题不会撞 id。

## 死链检查

站内相对链接在构建期解析，失败即报错。解析语义在 `LinkResolver.resolveLink`（`src/node/build/assets.ts`），与 VuePress 一致：

```ts
const candidates = bare.endsWith('.md')
  ? [bare]
  : [`${bare}.md`, `${bare}/index.md`, `${bare}/README.md`];
```

`./x` 依次尝试 `./x.md`、`./x/index.md`、`./x/README.md`，命中后换算成两个页面 route 之间的相对 href，所以任何部署 base 下链接都成立。找不到目标就记入 `deadLinks`，构建在 `generateBundle` 里用 `this.error` 终止并列出 `文件:行 -> 原始链接`；dev 请求命中死链页面时 warn 一次，页面照常渲染。

失败即报错的理由：静态站的链接部署后就是契约，构建期是最后一个能整体检查的时机，宽松通过等于主动发布 404。本地图片走同一条管线：`resolveImage` 读盘失败同样记死链；成功时 build 复制成带内容 hash 的 `assets/img/<name>.<hash><ext>`，dev 走 `/@fs/` 直出。不带 `./` 前缀的裸相对链接不报错，由 `strictLinks` 配置单独处理。

## git 最后编辑时间

页面 meta 的 `updatedAt` 来自 git 最后提交时间（`src/node/build/git.ts`）。逐文件调 `git log` 太慢，`getGitTimes` 做批量查询：

- 每批约 100 个路径调一次 `git log --format=\x01%cI --name-only --no-renames`，`\x01` 作 commit 行标记；git log 新到旧排列，文件第一次出现即最新时间。
- 批间并发上限 4：每次 `git log` 都要走全历史，无界并发等于 N 批同时压 CPU/IO。
- 批大小 100 是为了远离 Windows CreateProcess 约 32K 的 argv 上限。
- `core.quotepath=off` 让 git 输出原始非 ASCII 路径，默认配置下中文文件名会被 C 转义成无法与磁盘路径匹配的形式。

失败分级：不是 git 仓库或 git 缺失时整体返回空表（全站 `updatedAt` 为 null）；单批失败只丢该批的文件并 warn，其余批次不受影响。

## 摘要与渲染缓存

`SiteStore`（`src/node/build/site.ts`）持有渲染缓存：`filePath -> { mtimeMs, result, excerpt }`。build 用 mtime 判新鲜，dev 信 watcher 的 `invalidate()/resync()`，命中即跳过整条渲染。

`excerpt` 与渲染结果同生命周期缓存。`plainExcerpt`（`src/node/excerpt.ts`）从渲染后的 HTML 剥掉 script/style/pre 与全部标签、解码实体、压缩空白，head 的 meta description 取 160 字（`META_EXCERPT_LIMIT`），RSS 取 200 字。每次 emit 或 dev 请求重新扫每页全文是浪费，所以摘要跟着渲染一起缓存；它只依赖渲染产物，缓存失效条件完全一致。

渲染器实例本身也按 Shiki 语言集合缓存：`SiteStore` 先扫全部源文件的 fence 语言，把集合传给 `createMarkdownRenderer`，冷启动只加载站点实际用到的语法（默认全量加载实测约 2 秒）。dev 中某次编辑引入了新语言会置脏标记，下一个请求前重建渲染器并清空渲染缓存。

## RSS 只输出摘要

`renderRss`（`src/node/build/feeds.ts`）的 item description 是 `plainExcerpt(html, FEED_EXCERPT_LIMIT)`，不输出全文。取舍的原因写在 `excerpt.ts` 的头部注释里：全文输出需要把正文里的 asset token 和页内相对链接全部改写成绝对 URL——这些地址只在站内可解——等于在摘要逻辑之外复制一份 shell 的 base 改写，维护两份易碎的 URL 逻辑不划算。紧凑预览加 item 链接是两个消费方（RSS 阅读器与 head meta）都能用的形状。

其余细节：`feed: false` 的页面在取数前过滤；条目数上限 `feed.rssLimit` 默认 20；feed 是单语言的，`<language>` 取默认 locale 的 BCP-47 tag。sitemap 的 `lastmod` 用上面 git 批查的结果，归档页没有源文件、不给 `lastmod`；跨 locale 的页面与归档都带 hreflang alternate，与页面 head 里的链接同源。
