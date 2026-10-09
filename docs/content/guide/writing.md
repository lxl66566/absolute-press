---
date: 2026-10-03
category:
  - 指南
tag:
  - 写作
icon: solid/pen
---

# 写作指南

框架刻意把写作面收窄：一个 markdown 文件加最多六个 frontmatter 键，其余全部由目录结构与构建期推导。本页是日常写作的速查，语法细节见[Markdown 扩展](./markdown.md)。

## 文件即页面

`contentDir` 下每个 `**/*.md` 都是一个页面，路由为无扩展名的 `<相对路径>`，`index.md` 是所在目录的索引页：

```text
content/
├── index.md              # 首页 /
├── notes/foo.md          # /notes/foo
└── notes/index.md        # /notes/，目录行指向它
```

落盘文件形态不变：`/notes/foo` 写入 `notes/foo.html`，任何静态托管都能直接服务。目录索引页默认以 `/` 结尾，可用 `urls.directoryIndex` 切换（见[配置参考](./configuration.md#urls)与[部署](./deploy.md)）。

目录即分类：sidebar 按目录自动生成，文件夹行直接是该目录 `index.md` 的链接，行名取 `index.md` 的首个 h1（没有索引页时回退目录名），索引页不会在子项里重复出现。因此「移动一个文件」就是「移动一个页面」，导航、归档、关联图全部自动跟随。生成顺序是字母序，可用 `sidebar.order` / `sidebar.tweaks` 调整（见[配置参考](./configuration.md#sidebar)）。

## 标题与页面名

页面标题取正文**第一个 h1**，sidebar、TOC、归档、首页文章流、RSS 都用它；没有 h1 的页面标题为空，导航里回退显示文件路径。中文标题的锚点由 VuePress 2 同款 slugify 生成（移植自 @mdit-vue/shared），与 VuePress 逐字一致（中文原样保留、英文小写、空格转连字符），站内引用形如 `[配置参考](./configuration.md#基础字段)`。

## frontmatter 六个键

frontmatter 只认 `date` / `category` / `tag` / `icon` / `feed` / `overview`，其他键被忽略：

```md
---
date: 2026-10-03 # ISO 字符串或 yyyy-MM-dd；文章流排序与 RSS pubDate
category:
  - 指南 # 分类归档页（可多值）
tag:
  - 写作
  - markdown # 标签归档页（可多值）
icon: solid/rocket # 已注册的图标 key（iconProvider 或 icons）
feed: true # 默认 true；false 退出 RSS（文章流仍收录）
overview: true # 默认 true；仅对目录的 index.md 生效
---
```

- `date` 决定首页文章流与归档的倒序位置；省略时排在没有日期的文章之前按路由名兜底
- `icon` 在构建期校验：未注册的 key 直接构建报错。icon 值是完整 `<svg>` 字符串或裸 SVG 内部标记，在站点配置里集中注册一次（`iconProvider` 内置源或 `icons` 自定义 kv），frontmatter 只引用 key
- `overview` 只在目录的 `index.md` 上有意义：设为 `false` 时，navbar 面板不再出现该目录的总览行（顶层面板不生成、二级 folder 的面板也不合成），文件夹行本身仍然指向它，sidebar 与移动端抽屉不受影响
- 受密码保护的页面建议加 `feed: false`，避免标题与链接泄露进订阅源，见[加密](./encrypt.md)

## 时间：手写一个，其余交给 git

- `createdAt` 来自 frontmatter `date`，是文章流的排序依据
- `updatedAt` 取该文件 **git 最后一次提交时间**（构建时批量查询），不是 git 仓库（或文件未跟踪）时为 `null`，页面不显示更新时间

因此日常写作只需要在创建时写一次 `date`，「最后编辑于」由 git 自动维护，无手工同步成本。

## 站内链接与死链检查

`./` `../` 开头的相对链接在构建期 resolve，失败即构建报错，坏链接不可能被发布。文章互链一律带 `.md` 后缀写相对路径（`./related.md`、跨页锚点 `./related.md#小节`），受死链检查保护，移动文件时编辑器也友好。resolve 顺序、资源透传与裸链接策略见[Markdown 扩展](./markdown.md#站内链接与死链检查)。

## 图片

相对路径图片在构建期复制为内容 hash 命名，src 按页面深度重写，部署到任意子路径都不会断。独占一段的图片升级为 `<figure>`（alt 变 figcaption），支持 `![alt](src =宽x高)` 尺寸语法；全部写法与规则见[Markdown 扩展](./markdown.md#图片)。需要点击放大的截图用 ZoomedImg island，见[Islands](./islands.md#zoomedimg)。

## 推荐的写作流

1. 在合适目录新建 `xxx.md`，写 h1 与 frontmatter（至少 `date`）
2. 正文用[Markdown 扩展](./markdown.md)的语法组织；代码块默认带行号、超 15 行自动折叠，无需手工截图贴代码
3. 相关文章之间互相链接——构建层会汇总互引关系生成[关联文章图](./configuration.md#related)
4. `pnpm build` 或 dev 服务器验证：死链与 icon 错误会在构建期直接暴露
