---
date: 2026-10-03
category:
  - 指南
tag:
  - 搜索
  - 评论
icon: solid/comments
---

# 搜索与评论

搜索与评论都是站点级集成：构建层把配置写进页面 payload，主题 chrome 与 island 在客户端挂载对应组件，markdown 正文零参与。搜索有两种实现，用 `search` 配置二选一：内置**本地搜索**零依赖开箱即用；**Algolia DocSearch** 走外部爬虫索引。

## 本地搜索（推荐）

```ts
search: {
  kind: 'local';
}
```

构建时把每个 locale 的全部页面按标题切成小节、剥离成纯文本，产出一份按内容 hash 命名的索引模块（与其他共享产物一样进 `assets/`，immutable 缓存）。浏览器里完成检索：首次打开搜索框才加载索引并建库，之后常驻内存。

- **零配置零依赖**：不需要账号、爬虫或网络，索引随构建产物走，离线可用
- **中英文都直接可搜**：索引与查询共用同一分词器（拉丁按词、CJK 按重叠二元组），中文整句、英文前缀、拼写小偏差都能命中
- **结果带定位**：命中落到标题小节，点击直达对应锚点；标题与小节名加权排序，命中词在摘要里高亮
- `Ctrl/Cmd + K` 打开、`Esc` 关闭，桌面端导航栏有搜索框，移动端是图标按钮
- 加密页（`encrypt`）永远不进索引——密码门不能被搜索穿透；`exclude` 可再排除部分路由前缀：

```ts
search: { kind: 'local', exclude: ['/draft'] }
```

本站用的就是本地搜索，导航栏搜索框可以直接试（试着搜「搜索」）。

## Algolia DocSearch

```ts
search: {
  kind: 'algolia',
  appId: 'XXX',
  apiKey: 'XXX',       // search-only key，可公开
  indexName: 'xxx',
}
```

配置后导航栏挂载 DocSearch 搜索框（凭证随 payload 下发，search-only key 本来就是公开的）。三步接入：

1. 到 [DocSearch](https://docsearch.algolia.com/) 申请或自行在 Algolia 控制台创建索引，拿到三件套凭证；申请审核要求验证站点所有权时，把 Algolia 给的验证 meta 通过 `head` 配置加进页面（见[配置](./configuration.md#head)）
2. 填进站点配置的 `search` 字段
3. **全量重爬一次**：爬取配置里的 CSS 选择器要匹配新主题的 DOM 结构（正文容器、标题层级），旧站选择器不会自动适配

老站的三行 `algolia: { ... }` 写法仍然有效（等价于 `search: { kind: 'algolia', ... }`）；`search` 与 `algolia` 同时配置会在构建开始时报错，避免迁移期两份配置悄悄分叉。

搜索框样式已随主题亮暗适配，样式入口在 `src/client/theme/docsearch.css`。

## Giscus 评论

[giscus](https://giscus.app/zh-CN) 基于 GitHub Discussions，是本框架内置的评论方案。在 giscus.app 向导里选好仓库与分类后，把生成的四个值填进配置：

```ts
giscus: {
  repo: 'owner/repo',           // 公开仓库
  repoId: 'R_xxx',              // 向导生成
  category: 'General',          // Discussions 分类名
  categoryId: 'DIC_xxx',        // 向导生成
}
```

行为要点：

- 配置后**文章页尾部自动挂载**评论 island，不需要在 markdown 里手写标签；首页、归档等非文章页不挂
- 评论 iframe 的亮暗主题通过 postMessage 跟随站点主题切换，翻转主题不重载 iframe、不丢评论状态
- 评论与关联文章图共存时，关联图位于评论区上方
- 仓库需满足 giscus 的前提：公开、已开启 Discussions、安装 giscus App

## 选型建议

- 默认选本地搜索：不引入第三方服务，索引与产物同源同版本，永远不会 stale；几百页规模的站点索引构建与查询都是毫秒级
- 已有 Algolia 索引、需要跨站搜索或搜索分析时选 DocSearch；对开源项目免费
- 不配 `search` 则导航栏不出搜索框，不打包任何搜索代码；Giscus 同理，脚本只在配置存在时按需加载，未配置的站点不为它们付出任何字节

本站搜索用本地索引、评论用 Giscus：导航栏的搜索框和任意文章底部的评论区都是活的，可以当场试用；配置就是本仓库 `vite.config.ts` 里那两组值。
