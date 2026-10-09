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

搜索与评论都是站点级集成：在站点配置里填一组凭证，构建层把配置写进页面 payload，主题 chrome 与 island 在客户端挂载对应组件，markdown 正文零参与。

## Algolia DocSearch

```ts
algolia: {
  appId: 'XXX',
  apiKey: 'XXX',       // search-only key，可公开
  indexName: 'xxx',
}
```

配置后导航栏挂载 DocSearch 搜索框（凭证随 payload 下发，search-only key 本来就是公开的）。三步接入：

1. 到 [DocSearch](https://docsearch.algolia.com/) 申请或自行在 Algolia 控制台创建索引，拿到三件套凭证；申请审核要求验证站点所有权时，把 Algolia 给的验证 meta 通过 `head` 配置加进页面（见[配置](./configuration.md#head)）
2. 填进站点配置的 `algolia` 字段
3. **全量重爬一次**：爬取配置里的 CSS 选择器要匹配新主题的 DOM 结构（正文容器、标题层级），旧站选择器不会自动适配

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

- 文档站（本站形态）通常只配搜索：DocSearch 对文档结构的收录效果好，且对开源项目免费
- 博客站建议搜索加评论一起配；两个凭证都是公开值，进产物没有安全问题
- 都不配则完全不打包对应代码：DocSearch 与 Giscus 的脚本只在配置存在时按需加载，未配置的站点不为它们付出任何字节

本站两样都配了：导航栏的搜索框和任意文章底部的评论区都是活的，可以当场试用；凭证就是本仓库 `vite.config.ts` 里那两组值。
