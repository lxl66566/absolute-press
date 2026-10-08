---
date: 2026-10-03
category:
  - 指南
tag:
  - 部署
icon: deploy
---

# 部署指南

构建产物是纯静态文件：跑一次 `pnpm exec vite build`，`build.outDir`（本站为 `dist`）里就是完整站点。任何能托管静态文件的服务都能部署，运行时不需要 Node，也没有服务器端渲染或 API 依赖。

## 产物结构

```text
dist/
├── index.html                 # 每页一个独立 .html，目录即路由
├── guide/
│   ├── index.html             # 目录索引页
│   └── getting-started.html
├── assets/
│   ├── ...                    # 客户端 js/css（主题 chrome + islands runtime）
│   └── img/                   # 正文图片，内容 hash 命名
├── rss.xml                    # 最新 20 篇文章的订阅源
├── sitemap.xml                # 全部路由
├── robots.txt
├── 404.html                   # 未命中路径的回退页（完全内联、noindex）
└── _headers                   # 可选：deploy.cloudflare 产出（Cloudflare Pages）
```

- 路由是无扩展名的 clean URL：`guide/foo.md` → `/guide/foo`，`index.md` 产出所在目录的索引页（默认 `/guide/` 形态，可用 `urls.directoryIndex` 切换为 `/guide`）；落盘文件名始终带 `.html`，任何静态托管都能直接服务
- 中文等非 ASCII 路由段按 URL 编码生成链接（如归档页 `/tag/主题` 的编码形式），但**磁盘文件名是解码后的原文**：静态主机会先把请求路径 percent-decode 再查找文件，两边恰好对上，中文归档路由开箱可用，不需要重写规则
- KaTeX 样式表与按需加载的 island chunk（Mermaid / G2Plot / DocSearch / photoSwipe）同样在 `assets/` 下，随页面自动按相对路径引用，无需额外配置
- `404.html` 由构建生成（Cloudflare Pages / GitHub Pages 等主机用它响应未知路径，避免软 404），内容根的 `404.md` 可覆盖它；细节与限制见 [SEO](./seo.md#_404-页面)

## hostname 与子路径

`hostname` 是站点的规范 origin（不带尾斜杠），用于 canonical/og meta、RSS、sitemap 与 robots.txt 里的绝对链接，上线前务必配成真实域名：

```ts
defineSiteConfig({ hostname: 'https://absolute-docs.pages.dev' });
```

页面内部资源与站内链接全部使用按页面深度生成的相对前缀（根页面 `''`，一级子目录 `'../'`，依此类推），代码里不存在绝对路径假设。因此站点部署在域名根路径还是子路径（如 `https://example.com/blog/`）行为完全一致，换部署位置零配置改动。

## 各主机部署要点

产物没有服务器端要求，主流平台都是零配置或近零配置：

- **Cloudflare Pages / Netlify / Vercel**：构建命令 `pnpm build`，输出目录填 `build.outDir`；不需要 SPA rewrite（没有 `index.html` 回退的需求，每页都是真实文件）。部署到 Cloudflare Pages 时建议 `urls.directoryIndex: 'bare'`（CF 会把 `/guide/` 308 到 `/guide`，bare 是它的原生形态）
- **Cloudflare Pages 专属**：站点配置 `deploy: { cloudflare: true }` 让构建额外产出 `_headers`——`/assets/*`（内容 hash 命名）获得一年 immutable 缓存头，`/` 带一条指向客户端 entry chunk 的 modulepreload `Link` 头（只有 Cloudflare 会消费它，用于 Early Hints；其他主机直接忽略该文件）。与在 `public/` 自带 `_headers` 互斥：vite 会把 public 文件拷进产物，与 emit 的同名文件冲突，两种方式选一种（推荐配置项——entry 的 hash 文件名每次构建自动跟随）
- **GitHub Pages**：直接发布产物目录即可；`https://user.github.io/repo/` 这类子路径部署依赖上面的相对前缀机制，无需任何 base 配置。默认的 `'slash'` 形态就是 GH 的原生形态（`/guide` 会被 301 到 `/guide/`），无需调整
- **nginx / Caddy**：`root`（或 `file_server`）指向产物目录即可，不要配 `try_files ... /index.html` 之类的 SPA 回退

缓存策略建议：`assets/` 内的文件名带内容 hash（图片是 `名称.8位hash.扩展名`），可以放心长缓存（Cloudflare Pages 直接开 `deploy.cloudflare`，由 `_headers` 自动落地）；`.html` 与 `rss.xml` / `sitemap.xml` 用短缓存或协商缓存，保证发布后立即生效。

## 构建即校验

构建过程自带两类检查，CI 里跑一次构建就能拦下大部分上线事故：

- **死链检查**：正文里所有 `./` `../` 相对链接在构建期 resolve，失败直接报错并列出源文件与原始链接，坏链不可能被发布出去
- **icon 校验**：frontmatter `icon` 引用了站点配置 `icons` 未注册的 key 时报错

把构建命令接进 CI（或直接用托管平台的构建流水线）即可获得这两道闸门；本站的 `vite.config.ts` 就是一个可直接参考的完整配置。

## 持续集成建议

一个最小可行的发布流程：

```sh
pnpm verify                                  # 格式/静态检查/单测
pnpm exec vite build                         # 或 docs 专用配置
pnpm exec playwright test                    # e2e（自起 preview 服务）
```

托管平台绑定仓库后，把「构建命令」与「输出目录」填成上面的构建与产物目录即可；换域名只改站点配置里的 `hostname` 一处，`rss.xml` / `sitemap.xml` / `robots.txt` 下次构建自动跟随。
