---
date: 2026-10-08
category:
  - 设计
tag:
  - islands
  - solid
icon: code
---

# Island 机制实现

本文讲 island 从 markdown 标签到客户端激活的完整链路。涉及 `src/shared/islands.ts`（内置名单）、`src/node/markdown/islands.ts`（扫描与预渲染）、`src/client/runtime/`（注册表与激活）、`src/client/islands/`（内置组件）。用法层面的说明在[指南的 Islands 页](../guide/islands.md)，本文只讲实现。

## 链路总览

一条 island 的生命周期分四步：

1. 构建期扫描：`extractIslands` 在源文里找到已注册的 PascalCase 标签，换成占位 div。
2. 构建期预渲染：内部 markdown 经同一渲染器递归渲染成 HTML，最终产出 `<div data-ap-island="Tag" data-props="...">内部HTML</div>`。
3. 页面加载：`entry.tsx` 调 `registerIslands()` 装入组件注册表，再调 `hydrateIslands()`。
4. 客户端激活：占位 div 的 innerHTML 作为 `childrenHtml` 传给组件，Solid 组件挂载到该 DOM 节点上。

正文其余部分从不进入 Solid 渲染树；组件用 `mountComponent` 挂到已有 DOM 节点，不做 SPA 式的整页激活复用。

## 扫描规则

`extractIslands`（`src/node/markdown/islands.ts`）是一次性字符扫描，规则：

- 标签名必须匹配 `/^<([A-Z][A-Za-z0-9]*)/` 且在注册名单内，未注册的 PascalCase 标签按未知 HTML 原样透传。
- 命中后整段（开标签到闭标签）替换为 `<div data-ap-island-placeholder="i"></div>`。选 div 作占位是因为它是 markdown-it 已知的 html_block 标签，保证占位始终是块级 token、原样穿过渲染器；渲染结束后再按序号换回真正的 island div。
- 围栏代码块与行内 code span 一律跳过：扫描器先识别 ` ``` `/`~~~` 围栏（行首、连续 3 个以上）和反引号 run 配对的行内 code，里面的 `<Tag>` 是示例文本。
- 闭合标签搜索同样围栏感知，并用 depth 计数支持同名标签嵌套。island 可以在自己的围栏代码块里写用法示例，不会提前闭合自己。

island 只允许块级使用，标签独占段落。属性解析窗口上限 64KB，超出时 warn 并把标签留作纯文本——静默透传会让作者找不到原因。

## props 协议

属性语法向 Vue 看齐，实现在 `parseAttr`：

- `:x` 前缀的值走 `JSON.parse`，失败即构建报错（`invalid JSON value`）；无前缀的值是字符串原样。
- JSON prop 的 key 归一为 camelCase：`:box-data` 对应组件读的 `boxData`，data-props 里携带的就是组件侧的名字。字符串属性不做归一。
- 无值属性：裸 `flag` 得到字符串 `"true"`，`:flag` 得到布尔 `true`。

序列化侧是 `renderIslandDiv`：props JSON 经 attribute 转义后写进 `data-props`，内部 markdown 的渲染结果成为 div 的 innerHTML。客户端拿到的 props 就是这份 JSON 加 `childrenHtml`（见下）。island 内部 markdown 里还可以嵌套 island——`renderFragment` 递归走同一套提取与渲染。

## 客户端激活

激活核心在 `src/client/runtime/hydrate.ts` 的 `hydrateIslands`：

```ts
const childrenHtml = el.innerHTML;
el.innerHTML = '';
markMounted(el);
mountComponent(Comp, el, { ...props, childrenHtml } satisfies IslandProps);
```

要点：

- `data-ap-island-mounted` 标记防止二次激活。全文档调用（页面加载、路由切换）与作用域调用（ExpandableList 重建行 DOM 后激活子树）共享这个标记。
- 占位里预渲染的 innerHTML 先取出为 `childrenHtml` 再清空，组件决定怎么用它：PasswordGate 解锁后还原，ExpandableList 解析回条目，Counter 这类组件直接丢弃。
- 未注册的名字 warn 并跳过；`data-props` JSON 解析失败同样 warn，用空 props 继续。

## 注册表与编译期覆盖检查

内置 island 名单放在 `src/shared/islands.ts` 的 `BUILTIN_ISLAND_NAMES`：node 侧渲染器只需要标签名，不能 import 客户端组件，所以名单放 shared。

客户端注册表在 `src/client/runtime/islands.ts`，名单与组件 map 的一致性由一条编译期检查保证：

```ts
const _coverageCheck: Record<(typeof BUILTIN_ISLAND_NAMES)[number], true> = {
  Giscus: true,
  // ...
};
```

名单加了名字而注册表漏了组件（或反过来），tsc 直接报错，等不到运行时。

站点 island 经 vite 虚拟模块 `virtual:absolute-press/islands` 注入：`src/node/build/plugin.ts` 的 `load` 钩子按 `config.islands` 生成 `import I0 from "<模块>"; export default { "Counter": I0 }` 这样的模块代码，`registerIslands()` 把内置与站点两份 map 合并后通过 `setIslandRegistry` 推给 hydrate 模块。

依赖方向是刻意的单向流动：`runtime/islands.ts` value-import 组件，`hydrate.ts` 保持为叶子模块，组件经 `setIslandRegistry` 下行——island 组件自己也要调 `hydrateIslands` 做子树重激活，反向 import 会闭合成 ESM 环。`registerIslands` 必须由 `entry.tsx` 显式调用而不能做成模块副作用：`hydrateIslands` 只是 re-export，没有显式调用时 rolldown 会把整个模块 tree-shake 掉，所有 island 变成 unknown。

## 懒加载取舍

Mermaid 与 G2Plot 的组件壳随主 bundle 走，重依赖动态 import：`Mermaid.tsx` 里 `import('mermaid')`（mermaid 含 elk，chunk 很大），`G2Plot.tsx` 里 `import('@antv/g2plot')`。页面没有对应 island 时这些 chunk 完全不下载；代价是首次渲染图表要等一次网络与初始化。mermaid 的 ```mermaid 围栏也算入口：客户端 `upgradeMermaidFences` 把这类代码块升级成 Mermaid island，构建侧对 mermaid 围栏跳过行号、折叠与工具行（`SPECIAL_FENCE_LANGS`），因为客户端会重建这部分 DOM。

## entryListIslands：站点 island 复用 `@@@` 条目管线

ExpandableList 的 `@@@` 条目语法对站点自建列表同样有用，实现上把拆分管线做成了可复用的。站点把 island 名加进配置 `entryListIslands` 后，`renderer.ts` 里的判定多一个来源：

```ts
isEntryListIsland(spec.name) || entryListIslands.has(spec.name);
```

命中的 island children 不走普通递归渲染，交给 `renderEntryListChildren`（`src/node/markdown/entries.ts`）：

- `splitEntries` 在 markdown 渲染前拆分，围栏感知：`@@@ 标题` 开新条目（`@@@@` 及更长是内容），紧随的 `@@ meta` 行是该条目的 meta，首个 `@@@` 之前是 preamble。
- meta 按顶层 `|` 分列（`\|` 转义、行内 code 里的 `|` 不切），每段用 `renderFragmentInline` 走行内渲染——块级解析不启动，`">10h"`、`"#1"` 这类数据字符串保持字面量。
- 条目正文各自经 `renderFragment` 独立渲染；片段与页面共享 slugger 和链接收集，标题不进 TOC，脚注 id 加前缀隔离。
- 静态产物是 `.ap-xlist` 表格骨架：preamble 块加一张表，每条目一行标题加 meta 单元格、后跟一行全宽展开正文。无 JS 时整张表全展开可读。

客户端组件用 `childrenHtml` 接住这份骨架，按 `@@@` 标题作 key 解析回条目、把 TS 数据模块里的 meta 填进对应行，再调 `absolute-press/client` 导出的 `hydrateIslands` 重新激活正文里的嵌套 island。典型场景是「TS 数据 + md 插槽正文」的站点列表页：meta 列来自可校验的数据模块，markdown 只留正文。具体的配置写法与注意事项见[指南对应节](../guide/islands.md#站点-island-复用条目管线-entrylist)。
