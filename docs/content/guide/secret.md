---
date: 2026-10-03
category:
  - 指南
tag:
  - 加密
icon: shield
feed: false
---

# 加密演示页

你成功解锁了。本页被 vite.config.ts 里的规则命中：

```ts
encrypt: [
  {
    match: '/guide/secret',
    passwords: ['docs-demo'],
    hint: '演示密码 docs-demo（写在加密指南页里）',
  },
];
```

本页 frontmatter 设了 `feed: false`，所以它不会出现在 RSS 里。机制与边界见[加密](./encrypt.md)。

回到[指南目录](./)。
