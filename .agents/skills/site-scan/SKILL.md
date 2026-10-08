---
name: site-scan
description: absolute-press 框架的单遍内容扫描数据面与 onScan 钩子：站点要派生全站数据（taxonomy 统计、归档索引、跨页聚合）时用 onScan 而不是自己扫内容；凡改动 scan.ts / SiteStore 扫描缓存 / virtual:absolute-press/site-data / onScan 契约，或排查「内容被重复读盘 / island 全站数据不刷新 / site-data import 报错」，先读这个。
---

# 站点扫描数据面：scan.ts + onScan + site-data

框架对内容树**单遍扫描**：每个 markdown 文件每轮扫描恰好 `readFileSync` 一次，frontmatter 解析、渲染、shiki 预热、git 时间、站点钩子全部消费同一份缓存。站点侧的全站派生数据走 `onScan` 钩子注入 island，禁止在 vite.config 里自己 walk 目录/parse frontmatter。

## 组成与文件

| 部分 | 职责 | 位置 |
| --- | --- | --- |
| 数据面 | `scanSite` 单读扫描产出 `ScannedFile`（source/mtimeMs/frontmatter/rawFrontmatter/fenceLangs）；`siteScanContext` 组装钩子入参 | src/node/build/scan.ts |
| 生命周期 | SiteStore 持有 scan 缓存：sync 全量重建、invalidate→refreshScanEntry 单文件替换（按 walk-format key）、refreshScanContext 重跑钩子 | src/node/build/site.ts |
| 虚拟模块 | `virtual:absolute-press/site-data`：序列化钩子返回值；`\0` id + syncDone 门控；dev 失效链（change/resync → moduleGraph 失效 → full-reload） | src/node/build/plugin.ts |
| 契约 | `AbsolutePressConfig.onScan`、`SiteScanContext { config, pages }`、`SiteScanPage` 八字段 | src/node/config.ts |

## 站点侧用法（三步，完整示例见 docs/content/guide/islands.md 的 site-data 小节）

```ts
// 1. vite.config.ts：钩子返回任意 JSON 可序列化数据
onScan: (ctx: SiteScanContext) => ({
  pages: ctx.pages.map(p => ({ route: p.route, date: p.createdAt })),
}),
```

```ts
// 2. island 内直接 import；3. 站点自己在 d.ts 里 declare module 定型
import siteData from 'virtual:absolute-press/site-data';
```

钩子每轮扫描运行一次（dev 启动、构建、resync、内容编辑），dev 下数据自动刷新无需重启。

## 设计决策（改前必读）

- **onScan 不进 ResolvedConfig**，以 SiteStore 构造参数注入（plugin.ts 接线）。原因：`SiteScanContext.config: ResolvedConfig` 与 `ResolvedConfig.onScan` 互相引用，嵌入后消费方 tsc 在 `defineConfig` 处深度比较爆栈（TS7 报 excessive stack depth，TS5 直接崩溃）。
- **frontmatter 告警只在扫描发一次**：渲染器二次 parse 静默（renderer.ts），扫描是权威告警点。
- **`frontmatter` 是规范化结果**（六个识别键，category/tag 已成 string[]）；自定义键在 `rawFrontmatter`，值是 yaml 原生类型——裸日期是 `Date` 对象，进 island 前必须自行转换（返回值经 JSON 序列化，`Date` 会丢）。
- **未配置 onScan 时模块仍可 resolve**（不 import 不报错），但 load 抛指向性错误——刻意不静默给 null。
- **消费方若以源码链接消费框架**（非 npm 安装），tsconfig `paths` 须把 `vite` pin 到消费方自己的副本，否则框架源码解析到另一份 vite 类型，同样触发上述爆栈。

## 测试锚点

单读保证与契约细节在 src/node/build/__tests__/scan.test.ts；钩子生命周期（sync 运行、编辑重跑）在 site-store.test.ts 的 `SiteStore onScan`；模块契约与 dev 失效链在 plugin-hooks.test.ts 的 `virtual site-data module` / `site-data dev freshness`。
