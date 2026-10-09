---
date: 2026-10-03
category:
  - guide
tag:
  - encryption
icon: solid/lock
---

# Encryption

Absolute Press provides an article-level password gate: pages hit by a rule get their content wrapped in the PasswordGate island, and the content shows only after the correct password is entered.

## Configuration

```ts
encrypt: [
  {
    match: '/guide/secret', // exact string match on the route, or RegExp.test
    passwords: ['docs-demo'],
    hint: 'optional hint text',
  },
];
```

- `match` is a page route (the extensionless clean form, including the locale prefix); matched by string equality, or by regex `test` (avoid the `/g` flag — regexes are stateful and order-sensitive)
- With multiple rules, **the first hit wins**
- `hint` shows above the password input

## Mechanics

- At build time each password is hashed to sha256 hex and written into the page payload; plaintext passwords never enter the output
- The client compares the input via WebCrypto sha256; a match unlocks
- The unlocked state is remembered per route in sessionStorage (key: `ap-gate:<pathname>`), so no re-entry within the session
- The gate UI comes from the `PasswordGate` island; a wrong input gets a shake feedback

## Boundaries (important)

This is a **client-side password gate, not real encryption**: the content ships in full with the HTML and is merely hidden by CSS, so a technical reader can read it straight from the page source. It fits "keep out casual visitors" scenarios, not genuinely confidential content — a deliberate design tradeoff. If you need real encryption, split the content out before building.

Also: pages hit by a rule leave the sitemap automatically, and string rules append their match path as a robots.txt `Disallow` (RegExp rules cannot be expressed as robots patterns and stay unlisted). Give protected pages frontmatter `feed: false` to leave RSS too, so titles and links do not leak into the feed.

## Demo

This site has a real rule configured: the [encryption demo page](./secret.md) is hit by `match: '/en/guide/secret'`, and the demo password is the `docs-demo` in the config above; `match` also accepts a RegExp form — see the site's `vite.config.ts` for the syntax.

For the password gate's island activation and implementation details, see [islands runtime](./design/islands-runtime.md).
