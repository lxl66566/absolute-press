# absolute-press

预览：[absolute-press 文档](https://lxl66566.github.io/absolute-press) | [作者博客](https://absx.pages.dev/)

一个深度定制的静态博客站点框架：markdown 写正文，Solid 组件写交互。基于 SolidJS 2 + vite 8（rolldown），MPA + islands 架构。

## 核心设计

根据本人需求进行了深度定制化。导航、侧边栏、分类/标签归档、首页文章流、TOC、RSS/sitemap、评论、搜索、图片放大全部作为 builtin。站点的信息架构就是内容目录本身：目录结构决定导航，`index.md` 就是目录索引页，frontmatter 只认 `date / category / tag / icon / feed / overview` 六个键。markdown 放进内容目录，剩下的交给构建。

一切能在构建期解决的都在构建期解决。markdown 经 markdown-it 管线渲染成最终 HTML，`:::` 容器（tip/warning/details/tabs/code-tabs）、KaTeX、Shiki 双主题代码高亮（行高亮、折叠、软换行）、脚注、任务列表、黑幕、img-size、相对链接死链检查、git 最后编辑时间、RSS/sitemap 都是 builtin。

页面交互交给 islands。在 markdown 正文里直接写 `<MyIsland prop="str" :num="1">内部 markdown</MyIsland>`，组件在构建期预渲染成静态标记，浏览器里只有这些节点会执行代码，正文始终是纯 HTML。内置 Giscus、Mermaid、G2Plot、文章加密、图片放大、可展开的表格（特色）；自定义组件在 config 里一次注册，全局引用。

每页输出独立的 `.html`，无 JS 也可读，首次请求仅需 2 RTT；代价是没有 SPA 式的跨页过渡，用 Speculation Rules 的 prefetch/prerender 把 MPA 导航补到接近单页的手感。

### 横评

Astro 是理念最接近的框架：同样 islands，同样基于 Vite 的静态优先。Astro 是通用站点生成器，兼容各种运行时、包管理器，自由度高；而 absolute-press 是一个极为轻量、快速的定制博客框架。

- 内容约定不同。Astro 的导航、归档、TOC、文章流靠主题和集成补齐；absolute-press 里它们是 builtin 能力，目录即配置。
- islands 的写法不同。Astro 使用 `.astro` DSL 给组件标注 hydration，组件清单由页面结构决定；absolute-press 里组件写在 markdown 正文里，带 props、内部还能嵌 markdown，正文不引入 MDX 或任何组件语法。
- markdown 增强不同。Astro 走 remark/rehype 生态，容器语法、代码增强、数学公式自己挑插件拼管线；absolute-press 里开箱即得，而且语法规则刻意与 VuePress 保持一致，主要是为了方便从 VuePress 迁移。
- 定制方式不同。Astro 的深度定制通常是拷一份主题来改；absolute-press 里通过 VuePress 风格的变量（`#ap-*` 挂载点、`ap-container--*` 等渲染器 class、亮暗双套 CSS 变量）进行简易定制。

VuePress / VitePress 是另一类基于 Vue 的 markdown 加组件的内容站框架。实际上[作者本人博客](https://absx.pages.dev/)就是从 [vuepress-theme-hope](https://theme-hope.vuejs.press/) 迁移而来。迁移到本框架的原因有：

- 不想再写 vue 组件了，希望使用我最熟悉的、目前性能最顶级的 SolidJS 编写组件。
- VuePress 内部样式有许多坑、不可修改的框架行为；对于需要深度定制化的用户，不如用一个能完全掌控的框架来得舒适。
- 构建慢、加载慢、性能差。

## 上手

```bash
pnpm create absolute-press my-blog
cd my-blog
pnpm install && pnpm dev
```

站点配置只有 `vite.config.ts` 一处：

```ts
import { absolutePress, defineSiteConfig } from 'absolute-press';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  build: { target: 'esnext' },
  plugins: [
    UnoCSS(),
    solidPlugin(),
    absolutePress(
      defineSiteConfig({
        contentDir: 'src',
        title: 'My Blog',
        description: '站点描述，进入 SEO 与 RSS',
        hostname: 'https://example.com',
      }),
    ),
  ],
});
```

`solid-js` 与 `@solidjs/web` 是 peer 依赖，脚手架模板已经配好。完整配置见[配置参考](./docs/content/guide/configuration.md)，frontmatter 键见[写作指南](./docs/content/guide/writing.md)。

## 性能

以下是本仓库文档站（22 页、中英双 locale、Windows）的实测：

- 全量构建约 2s；dev 冷启动到首字节约 2.2s
- 页面关键路径约 65KB gzip（entry JS 55KB + CSS 10KB）；mermaid、G2Plot、Algolia 搜索、图片放大、关联文章图全部动态按需加载，KaTeX 样式只注入有公式的页面
- MPA 导航配 Speculation Rules：hover 预取、按下即预渲染，目标页在激活前就已备好
- 渲染缓存双策略：构建按 mtime 增量复用，dev 按 watcher 事件单页失效，未变更的页面不重复渲染

## 说明

包的 `exports` 直接指向 TS 源码：本框架的消费方必然运行 Vite（SSG 构建与客户端打包都发生在 Vite 里），由 Vite 加载 TS 源码即可，省掉 dist 构建和类型产物的双轨维护。入口两个：`absolute-press`（构建期，`absolutePress` / `defineSiteConfig`）与 `absolute-press/client`（浏览器侧，`hydrateIslands` / `pagePayload`）。npm 发布内容只含 `src`。

源码直出也意味着宿主跑自己的 `tsc --noEmit` 时可能解析到本包源码，用户 tsconfig 需要以下几项：

- `moduleResolution: "bundler"`——经 package exports 解析本包入口
- `allowImportingTsExtensions: true`——本包内部相对导入带显式 `.ts` 扩展名
- `jsx: "preserve"` 与 `jsxImportSource: "solid-js"`——客户端 `.tsx` 源码的 JSX 类型
- `paths` 把 `"solid-js/jsx-runtime"` 映射到 `@solidjs/web` 的 `types/jsx.d.ts`——solid-js 2.0 RC 没有独立的 jsx-runtime 导出，JSX 类型在 `@solidjs/web` 里
- `types` 包含 `"node"`（或宿主装有 `@types/node`）——node 侧构建源码使用 node API

架构与契约见 [AGENTS.md](./AGENTS.md)。

## License

MIT
