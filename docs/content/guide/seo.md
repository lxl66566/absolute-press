---
date: 2026-10-03
category:
  - 指南
tag:
  - seo
  - rss
icon: search
---

# SEO 与订阅

每页的 `<head>`、订阅源与站点地图都在构建期生成完毕，没有运行时 SEO 处理。本页列出全部产出的来源与调优点。

## 页面 head

每页 head 由构建层写入（见 `src/node/build/shell.ts`）：

| 项                          | 值                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `<title>`                   | `页面标题 \| 站点名`；页面无 h1 或标题与站点名相同时只留站点名                                |
| `meta description`          | 正文纯文本摘要（约 160 字符）；无正文时回退站点 `description`                                 |
| `link canonical`            | `hostname + 页面路由`                                                                         |
| `og:type`                   | locale 首页与分类/标签归档页 `website`，其余页面 `article`                                    |
| `og:title` / `og:site_name` | 页面标题（含站点名后缀）/ 站点名                                                              |
| `og:description`            | 同 `meta description`（页面摘要优先）                                                         |
| `og:url`                    | `hostname + 页面路由`                                                                         |
| `og:image` / `twitter:card` | 配置 `seo.image` 时输出绝对地址图 + `summary_large_image`；未配置时仅 `twitter:card: summary` |
| `link alternate (rss+xml)`  | `<hostname>/rss.xml` 的 RSS autodiscovery                                                     |
| `link alternate (hreflang)` | 多语言镜像页：每个对应 locale 一条 + `x-default`（默认 locale 版本）                          |
| `<html lang>`               | 所属 locale 的 `lang` 值                                                                      |

摘要由构建期从渲染后的正文一次性提取（跳过代码围栏/脚本样式，解码实体后截断），与渲染缓存同生命周期，随 payload 下发（`page.excerpt`），软导航时客户端同步逻辑复用同一份。站点 `description` 仍是无正文页面的兜底，值得认真写。

hreflang 互链按「同 relPath 的跨 locale 镜像页」推导：locale 目录按约定镜像结构，但框架不保证某页在所有 locale 都有对应译文，因此每条互链都在构建期对照完整页面清单验证存在性，缺译文的页面安静退出（不虚构 URL）；只在单一 locale 存在的页面不输出 hreflang。归档页同理，按「同分类/标签名的跨 locale 归档页」推导。

正文无 JavaScript 也完整可读：标题、正文、目录锚点全是静态 HTML，爬虫拿到的是最终内容，不存在客户端渲染白页。

## RSS

构建产物 `rss.xml`：

- 收录默认 locale 与各 locale 的文章，按 `createdAt` 倒序取最新 `feed.rssLimit` 篇（默认 20），见[配置参考](./configuration.md#feed)
- frontmatter `feed: false` 的页面退出订阅源（首页文章流仍收录）
- 每条 item 含标题、绝对链接（`hostname` 拼接）、`pubDate`（来自 `date`）与 `category`

订阅地址就是 `<hostname>/rss.xml`，阅读器直接订阅即可；每页 head 同时输出该地址的 `<link rel="alternate" type="application/rss+xml">`，阅读器可自动发现订阅源。

## sitemap 与 robots.txt

- `sitemap.xml`：全部页面路由（含归档页、各 locale），每条 `<loc>` 用 `hostname` 拼成绝对地址；内容页带 `<lastmod>`（取该文件 git 最后一次提交时间，W3C UTC 格式），归档页无源文件故不带；有跨 locale 镜像页的条目带 `xhtml:link` hreflang 互链（与页面 head 一致）。命中 encrypt 规则的页面不进入 sitemap——sitemap 条目等于把 URL 主动递给爬虫，与密码门的「不列出」意图相悖
- `robots.txt`：`User-agent: * / Allow: /` 加一行 `Sitemap: <hostname>/sitemap.xml`；encrypt 的字符串规则各追加一条 `Disallow`（与匹配侧同款归一化路径，非 ASCII 路由写解码后的原文）；RegExp 规则无法表达为 robots 模式，不会写入

两者都由构建层生成，换域名只改 `hostname` 配置，无需手工维护。

## 404 页面

构建额外产出完全内联的 `404.html`（无外部 css/js/字体），Cloudflare Pages / GitHub Pages 等静态主机会用它响应不存在的路径，避免「软 404」——任意路径返回 200 + 首页会被搜索引擎收录。页面带 `<meta name="robots" content="noindex">`，文案与 `<html lang>` 跟随默认 locale，亮暗色由内联的 `prefers-color-scheme` 媒体查询提供。

两处已知边界：

- 404 会在任意深度的未知 URL 下被服务，相对路径必坏，所以页面必须完全内联；同理返回首页的链接写成根绝对的 `href="/"`——框架无法感知部署子路径，子路径部署（如 `https://user.github.io/repo/`）下该链接指向域名根而非站点根
- 内容根放一个 `404.md` 即可用自己的页面替换生成的兜底页

## 其他 head 注入

- **Google Analytics**：配置 `googleAnalytics: 'G-XXX'` 后注入 gtag 脚本，异步加载
- **Speculation Rules**（仅构建产物）：Chromium 会对站内链接做 prefetch（悬停）与 prerender（按下指针），MPA 导航在支持的平台接近 SPA 手感；Safari/Firefox 自动忽略，保持普通导航
- **防 FOUC 脚本**：首屏渲染前从 localStorage 读主题写上 `html[data-theme]`，避免亮暗闪屏；脚本不依赖任何外部资源

## 检查清单

上线前快速自检：

- [ ] `hostname` 是真实域名（不是 `localhost`），canonical/RSS/sitemap 都由它拼出
- [ ] 每页首个 h1 就是想要的 `<title>` 前半段
- [ ] `description` 覆盖站点定位，多 locale 站点没有「中文描述配英文页」的需求时保持中性文案
- [ ] 敏感页（密码门保护的）已设 `feed: false`
- [ ] `rss.xml` / `sitemap.xml` / `robots.txt` / `404.html` 在产物根目录存在且链接可访问
