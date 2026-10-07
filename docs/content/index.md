# Absolute Press

一个 SolidJS 静态博客框架：markdown 写正文，Solid 组件写交互。MPA SSG + islands 架构，基于 vite 8（rolldown）与 SolidJS 2。

[GitHub](https://github.com/lxl66566/absolute-press) · [作者博客](https://absx.pages.dev/)（由本框架构建）

本站同时是框架的端到端演示场：每篇指南都在真实使用它所讲的功能——搜索框、评论区、加密页、图表 island 全是活的。

## 快速开始

```bash
pnpm create absolute-press my-blog
cd my-blog
pnpm install && pnpm dev
```

## 特性

- **目录即信息架构**：导航、侧边栏、分类/标签归档、首页文章流都从内容目录推导，frontmatter 只有六个键
- **markdown 增强全开**：八种容器、tabs/代码组、Shiki 双主题高亮、KaTeX、脚注、黑幕、死链检查，见[Markdown 扩展](./guide/markdown.md)
- **islands 交互**：正文纯静态，交互组件在 markdown 里直接写标签，构建期预渲染、客户端按需激活，见[Islands](./guide/islands.md)
- **站点能力内置**：搜索、评论、RSS/sitemap、密码门、关联文章图、多语言，填配置即用，见[配置参考](./guide/configuration.md)
- **快**：本站点（20+ 页、中英双语）全量构建约 2s，页面关键路径约 65KB gzip，重资源全部按需加载

## 阅读路径

- 搭建自己的站点：从[快速开始](./guide/getting-started.md)进入[指南](./guide/index.md)
- 从 vuepress-theme-hope 迁移：[迁移指南](./guide/migration.md)，正文语法逐字兼容
- 面向 SSG 开发者的设计取舍与实现细节：[设计与实现](./guide/design/index.md)

## License

MIT
