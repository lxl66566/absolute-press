---
date: 2026-10-03
category:
  - 指南
tag:
  - 迁移
  - vuepress
icon: migrate
---

# 迁移指南

Absolute Press 的设计目标就是替代 vuepress-theme-hope：markdown 正文零改动迁移，URL 保持不变。本页列出兼容性承诺与已知不兼容项。

## URL 兼容

- 路由保持 `.html` 后缀：`docs/xxx.md` → `/xxx.html`，与 theme-hope 生成的地址逐字相同
- 中文标题锚点用 VuePress 2 同款 slugify（移植自 @mdit-vue/shared），与 VuePress **逐字一致**（中文原样保留、英文小写、空格转连字符），旧外链的 `#锚点` 不会失效
- base 自动检测：按页面深度生成相对前缀，换部署子路径不用改任何链接

## 正文语法兼容清单

以下语法与 theme-hope 行为一致，正文可直接平移：

- `:::` 容器：tip / warning / danger / caution / error / info / details / right，自定义标题与 `::::` 嵌套
- tabs / code-tabs + `@tab` / `@tab:active`，`#id` 持久化
- 代码块行高亮 `{1,3-5}`、`:collapsed-lines`（裸旗标与 theme-hope 一样按 15 行折叠）、`title="..."`
- KaTeX 行内 `$...$` 与块级 `$$...$$`
- Unicode 脚注标签（如 `[^胆结石]`）
- 任务列表、`==行内标记==`
- heimu 黑幕 `!!文本!!`
- 图片尺寸：`![alt](src =300x)` 与 `![alt =300x](src)` 两种写法都支持（obsidian 的 `![alt|300x200](src)` 不支持）
- 独占一段的图片升级为 figure

## 已知不兼容项

- **`<template #xxx>` 与 vue 组件语法**：按未知 HTML 原样透传（框架不兼容），迁移时需逐页改造——改成 island 或重写为 markdown 语法
- **frontmatter 只认六个键**：`date` / `category` / `tag` / `icon` / `feed` / `overview`；theme-hope 的其他键（如 `order`、`sticky`）被忽略，导航排序等能力以站点配置为准（如 `nav.exclude`）
- **icon 必须注册**：frontmatter `icon` 必须是站点配置 `icons` map 的 key，构建期校验；theme-hope 的 iconfont class 写法需要换成注册的 svg
- **加密语义**：theme-hope 的密码加密是构建期真加密；Absolute Press 是客户端密码门（sha256 比对 + sessionStorage，内容仍随 HTML 下发），见[加密](./encrypt.md)
- **关联文章图**只含一度邻居；ArticleCard 的 icon 仍是文本 chip

## 迁移步骤建议

1. 把原站 markdown 按原目录结构放进新的 `contentDir`，URL 即不变
2. 站点配置里注册原站用到的 icon（svg 字符串）
3. 跑一次构建：死链检查会暴露正文里的相对链接坏链（框架对 `./` `../` 链接 resolve 失败直接报错），按报错清单逐个修正即可
4. 逐页改造 `<template #xxx>` 与 vue 组件语法
5. 对照[主题定制](./theme.md)把旧的自定义样式接到 `--c-*` 变量（或沿用 `--vp-c-*` 别名）

## 能力对照速查

| theme-hope                   | Absolute Press                              |
| ---------------------------- | ------------------------------------------- |
| `.html` 路由 + 中文锚点      | 逐字兼容                                    |
| markdown 正文语法            | 逐字兼容（见上文清单）                      |
| `<template #xxx>` / vue 组件 | 透传，需逐页改造                            |
| frontmatter 全量键           | 只认 `date/category/tag/icon/feed/overview` |
| 构建期密码加密               | 客户端密码门（非真加密）                    |
| 主题插槽/组件覆写            | CSS 变量 + 挂载点 DOM                       |

迁移完成后，[Markdown 扩展](./markdown.md)页可以作为正文的回归自测清单。
