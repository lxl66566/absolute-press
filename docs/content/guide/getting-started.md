---
date: 2026-10-01
category:
  - 指南
tag:
  - 入门
  - 安装
icon: rocket
---

# 快速开始

Absolute Press 是一个 vite 插件：项目里接入 `absolutePress(defineSiteConfig({...}))` 之后，`contentDir` 下的每个 markdown 文件都会被构建成独立的 `.html` 页面。本页从脚手架开始，把一个最小站点跑起来；每一步的配置文件都是完整可复制的。

## 脚手架

新站点推荐用 create 命令起步：

```sh
pnpm create absolute-press my-blog
cd my-blog
pnpm install && pnpm dev
```

脚手架生成的模板已经配好 vite、UnoCSS、Solid 与全部 peer 依赖，内容目录 `src/` 里带了一个首页和一篇示例文章，`pnpm dev` 即可直接预览。下面的手动接入做的事情和模板相同，想理解每一部分来源可以对照着读。

## 手动接入

框架以 TypeScript 源码形式发布，包入口 `absolute-press` 直接指向源文件，由 Vite 在构建时加载（SSG 构建和客户端打包本来都发生在 Vite 里），因此没有 dist 产物，也不需要额外的构建配置。安装依赖：

```sh
pnpm add -D absolute-press solid-js @solidjs/web unocss vite-plugin-solid
```

其中 `solid-js` 与 `@solidjs/web` 是 peer 依赖，版本需要用 Solid 2.0 的 RC 线（`2.0.0-rc.13`）；本仓库的开发方式是用 pnpm `link:` 指向框架仓库目录，此时依赖从框架仓库的 node_modules 解析，其余项目直接从 npm 安装即可。

### vite.config.ts

```ts
import { absolutePress, defineSiteConfig } from 'absolute-press';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  build: {
    target: 'esnext',
  },
  plugins: [
    UnoCSS(),
    solidPlugin(),
    absolutePress(
      defineSiteConfig({
        contentDir: 'src',
        title: 'My Blog',
        description: '站点描述，进入 SEO 与 RSS',
        // 改成你的正式域名，RSS/sitemap/canonical 都由它拼出
        hostname: 'https://example.com',
      }),
    ),
  ],
});
```

站点配置的四项必填字段：`contentDir` 是默认语言的内容根目录；`title` 与 `description` 进入页面 head、RSS 与 sitemap；`hostname` 是不带尾斜杠的规范 origin。其余字段见[配置参考](./configuration.md)。

### tsconfig.json

宿主项目的 `tsc` 会解析到框架的 TS 源码，编译选项需要满足三个源码形态的要求：

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    // solid-js 2.0 RC 没有独立的 jsx-runtime 导出，JSX 类型在 @solidjs/web 里
    "paths": {
      "solid-js/jsx-runtime": ["./node_modules/@solidjs/web/types/jsx.d.ts"],
    },
    "types": ["vite/client", "node"],
    "noEmit": true,
    "strict": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
  },
  "exclude": ["dist", "node_modules"],
}
```

三项要求的对应关系：`moduleResolution: "bundler"` 让 TS 经 package exports 解析包入口；`allowImportingTsExtensions` 容忍框架内部相对导入携带的显式 `.ts` 扩展名；`paths` 把 `solid-js/jsx-runtime` 映射到 `@solidjs/web` 的 JSX 类型定义。`types` 里的 `node` 服务于构建期代码对 Node API 的使用。

### uno.config.ts

主题样式消费 UnoCSS 的原子类与 CSS 变量，preset 用 wind4：

```ts
import { presetWind4, type Theme } from '@unocss/preset-wind4';
import { defineConfig, type UserConfig } from 'unocss';

const config: UserConfig<Theme> = defineConfig({
  presets: [presetWind4()],
  preflights: [
    {
      // 主题里非链接的可点控件（按钮、CSS-only tabs 的 label）给手型光标
      getCSS: () => `
button:not(:disabled),
[role='button']:not([aria-disabled='true']),
.ap-tabs > label {
  cursor: pointer;
}`,
    },
  ],
});

export default config;
```

UnoCSS 是可选依赖：完全不想要原子类的话，可以去掉这个插件，只用主题自己的 CSS 变量写站点样式。

## 目录结构

```text
.
├── vite.config.ts
├── uno.config.ts
└── src/               # contentDir：默认语言的内容在根
    ├── index.md       # 首页（/）
    ├── posts/
    │   ├── index.md   # 目录索引页 /posts/
    │   └── hello.md   # /posts/hello
    └── en/            # 其余语言放 <contentDir>/<key>/，见多语言一章
```

路由规则是 `**/*.md` 对应无扩展名的 `<路径>`（落盘为 `<路径>.html`），`index.md` 生成所在目录的索引页。导航（navbar 与 sidebar）、分类与标签归档、首页文章流都从这份目录结构推导，不需要在配置里登记页面。

## 开发与构建

```sh
pnpm dev       # 开发服务器，markdown 改动触发整页刷新
pnpm build     # 产出纯静态站点
pnpm preview   # vite preview 预览构建产物
```

构建先打客户端 bundle（主题 chrome 与 islands runtime），再为每页生成一个完整 HTML，附带头部的防闪屏脚本、页面 payload，以及 `rss.xml`、`sitemap.xml`、`robots.txt`。构建过程同时做两类校验：正文里 `./` `../` 相对链接解析失败直接报错（死链检查），frontmatter `icon` 引用了未注册的图标也直接报错。坏链接因此不可能被发布出去。

## 下一步

- [配置参考](./configuration.md)补全站点能力：多语言、搜索、评论、加密、关联图都在这里
- [写作指南](./writing.md)与[Markdown 扩展](./markdown.md)覆盖日常写作的全部语法
- 需要[组件岛](./islands.md)时再回来，内置六个，自己的组件注册一次全站可用
