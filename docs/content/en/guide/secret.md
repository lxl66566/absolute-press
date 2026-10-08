---
date: 2026-10-03
category:
  - guide
tag:
  - encryption
icon: shield
feed: false
---

# Encryption Demo Page

You unlocked it. This page is hit by a rule in vite.config.ts:

```ts
encrypt: [
  {
    match: '/en/guide/secret',
    passwords: ['docs-demo'],
    hint: 'Demo password docs-demo (see the encrypt guide)',
  },
];
```

This page sets `feed: false` in frontmatter, so it does not appear in RSS. Mechanics and boundaries in [Encryption](./encrypt.md).

Back to the [guide index](./).
