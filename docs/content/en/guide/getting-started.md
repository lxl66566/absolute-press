---
date: 2026-10-01
category:
  - guide
tag:
  - getting-started
icon: rocket
---

# Getting started

Absolute Press is a vite plugin: once a project wires in `absolutePress(defineSiteConfig({...}))`, every markdown file under `contentDir` is built into an independent `.html` page. This page starts from the scaffold and gets a minimal site running; every config file along the way is complete and copyable.

## Scaffold

The recommended way to start a new site is the create command:

```sh
pnpm create absolute-press my-blog
cd my-blog
pnpm install && pnpm dev
```

The generated template already wires up vite, UnoCSS, Solid, and all peer dependencies. The content directory `src/` ships with a home page and a sample article, so `pnpm dev` gives you a preview immediately. The manual setup below does exactly what the template does; read along if you want to know where each piece comes from.

## Manual setup

The framework is published as TypeScript source: the package entry `absolute-press` points directly at source files, loaded by Vite at build time (both the SSG build and the client bundling happen inside Vite anyway), so there is no dist output and no extra build configuration. Install the dependencies:

```sh
pnpm add -D absolute-press solid-js @solidjs/web unocss vite-plugin-solid
```

`solid-js` and `@solidjs/web` are peer dependencies and must be on the Solid 2.0 RC line (`2.0.0-rc.13`). This repository itself develops via a pnpm `link:` to the framework repo, in which case dependencies resolve from the framework's node_modules; every other project installs from npm as usual.

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
        description: 'Site description, feeds SEO and RSS',
        // Change to your production domain; RSS/sitemap/canonical are built from it
        hostname: 'https://example.com',
      }),
    ),
  ],
});
```

The site config has four required fields: `contentDir` is the content root of the default locale; `title` and `description` go into page head, RSS, and sitemap; `hostname` is the canonical origin without a trailing slash. See [Configuration reference](./configuration.md) for the rest.

### tsconfig.json

The host project's `tsc` resolves into the framework's TS source, so the compiler options must satisfy three source-shape requirements:

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
    // solid-js 2.0 RC has no standalone jsx-runtime export; JSX types live in @solidjs/web
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

How the three requirements map: `moduleResolution: "bundler"` lets TS resolve package entries through package exports; `allowImportingTsExtensions` tolerates the explicit `.ts` extensions on the framework's internal relative imports; `paths` maps `solid-js/jsx-runtime` to the JSX type definitions in `@solidjs/web`. The `node` entry in `types` covers build-time code that uses Node APIs.

### uno.config.ts

The theme styles consume UnoCSS atomic classes and CSS variables, using the wind4 preset:

```ts
import { presetWind4, type Theme } from '@unocss/preset-wind4';
import { defineConfig, type UserConfig } from 'unocss';

const config: UserConfig<Theme> = defineConfig({
  presets: [presetWind4()],
  preflights: [
    {
      // Non-link clickable controls in the theme (buttons, CSS-only tab labels) get the pointer cursor
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

UnoCSS is optional: if you want no atomic classes at all, drop the plugin and write site styles against the theme's own CSS variables.

## Directory structure

```text
.
├── vite.config.ts
├── uno.config.ts
└── src/               # contentDir: default-locale content lives at the root
    ├── index.md       # home page (/)
    ├── posts/
    │   ├── index.md   # directory index page /posts/
    │   └── hello.md   # /posts/hello
    └── en/            # other locales go in <contentDir>/<key>/, see the i18n chapter
```

Routing rule: `**/*.md` maps to the extensionless `<path>` (emitted as `<path>.html`), and `index.md` produces the index page of its directory. Navigation (navbar and sidebar), category/tag archives, and the home article feed are all derived from this directory structure — no page registration in config.

## Develop and build

```sh
pnpm dev       # dev server; markdown edits trigger a full page reload
pnpm build     # produces a fully static site
pnpm preview   # vite preview of the build output
```

The build first bundles the client (theme chrome and islands runtime), then generates one complete HTML per page with the anti-FOUC script in the head, the page payload, plus `rss.xml`, `sitemap.xml`, and `robots.txt`. The build also runs two validations: a `./` `../` relative link in content that fails to resolve is a build error (dead link checking), and a frontmatter `icon` referencing an unregistered icon is a build error too. Broken links cannot be published.

## Next steps

- [Configuration reference](./configuration.md) completes the site feature set: i18n, search, comments, encryption, and the related graph all live there
- [Writing guide](./writing.md) and [Markdown extensions](./markdown.md) cover every syntax used in daily writing
- Come back for [component islands](./islands.md) when you need them: six built in, and your own components work site-wide after one registration
