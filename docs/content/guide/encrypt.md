---
date: 2026-10-03
category:
  - 指南
tag:
  - 加密
icon: lock
---

# 加密

Absolute Press 提供文章级密码门：命中规则的页面正文被 PasswordGate island 包裹，输入正确密码后才显示内容。

## 配置

```ts
encrypt: [
  {
    match: '/guide/secret.html', // 字符串精确匹配路由，或 RegExp.test
    passwords: ['docs-demo'],
    hint: '可选提示文案',
  },
];
```

- `match` 是页面路由（带 `.html` 后缀、含 locale 前缀）；字符串全等匹配，或用正则 `test`（避免 `/g` 标志——正则有状态，顺序敏感）
- 多条规则时**第一条命中的生效**
- `hint` 显示在密码输入框上方

## 运行机制

- 构建期把每个密码算成 sha256 hex 写进页面 payload，明文密码不进入产物
- 客户端用 WebCrypto sha256 比对输入，命中即解锁
- 解锁状态按路由记在 sessionStorage（key：`ap-gate:<pathname>`），会话内免重复输入
- 密码门 UI 由 `PasswordGate` island 提供，输入错误有抖动反馈

## 边界（重要）

这是**客户端密码门，不是真加密**：正文完整地随 HTML 下发，只是被 CSS 隐藏，懂技术的读者可以直接从页面源码读到内容。适合"防误入"场景，不适合真正的机密内容——这是刻意的设计取舍。需要真加密请构建前拆分内容。

另外：受保护页面建议设置 frontmatter `feed: false` 退出 RSS，避免标题与链接泄露进订阅源。

## 演示

本站配置了真实规则，[加密演示页](./secret.md)被 `match: '/guide/secret.html'` 命中，演示密码就是上面配置里的 `docs-demo`；`match` 也接受 RegExp 形式，写法见站点的 `vite.config.ts`。

密码门的 island 激活与实现细节见[islands 运行时](../design/islands-runtime.md)。
