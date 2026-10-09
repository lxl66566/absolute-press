import { fileURLToPath } from 'node:url';

// Consumes the framework through its own public entry (self-reference).
import { absolutePress, defineSiteConfig } from 'absolute-press';
import UnoCSS from 'unocss/vite';
import type { UserConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { configDefaults, defineConfig } from 'vitest/config';

// Official docs site. Also serves as an end-to-end showcase and self-test
// of the framework: every guide page exercises a real feature path, and the
// site config below is itself the full-featured reference (search, comments,
// analytics, social, encrypt, i18n, custom island).
const config: UserConfig = defineConfig({
  build: {
    target: 'esnext',
  },
  plugins: [
    UnoCSS(),
    solidPlugin(),
    absolutePress(
      defineSiteConfig({
        contentDir: 'docs/content',
        // Term-reference articles for the `[[id]]` syntax (guide/markdown);
        // excluded from routing, rendered as hover popovers only.
        refs: ['reference'],
        title: 'Absolute Press',
        description:
          'Absolute Press：SolidJS 静态博客框架官方文档。MPA SSG + islands 架构。',
        hostname: 'https://lxl66566.github.io/absolute-press',
        locales: {
          en: { lang: 'en', label: 'English' },
        },
        head: [
          '<meta name="algolia-site-verification"  content="154015213040B8F8" />',
        ],
        // Docs landing page: the prose intro (hero/features/reading paths)
        // is the page's primary; the paginated article feed would push it
        // below the fold and read like a blog archive.
        home: { feed: false },
        favicon: '/favicon.svg',
        seo: {
          author: { name: 'lxl66566', url: 'https://github.com/lxl66566' },
        },
        // Every FA free glyph registered by the framework's icon provider
        // under its <pack>/<name> key; frontmatter `icon` references a
        // registered key.
        iconProvider: 'fontawesome',
        algolia: {
          appId: 'O9JW6I7R5M',
          apiKey: '3b5ac7214c5b516709dec2584a3e9e2a',
          indexName: 'absolute-press-crawler',
        },
        giscus: {
          repo: 'lxl66566/absolute-press',
          repoId: 'R_kgDOU_0Cgw',
          category: 'General',
          categoryId: 'DIC_kwDOU_0Cg84DHb0i',
        },
        // googleAnalytics: 'G-MKRDBH1ZP1',
        nav: {
          // Navbar social buttons; `github` resolves to the built-in brand glyph.
          social: [
            {
              icon: 'github',
              url: 'https://github.com/lxl66566/absolute-press',
              title: 'GitHub',
            },
          ],
          align: 'center',
        },
        sidebar: {
          // Reading order of the guide's members (pages and subfolders by
          // extension-less name; the folder index page is the group row
          // itself and is not orderable). Unlisted members keep their
          // generated (alphabetical) order after the listed ones.
          tweaks: {
            guide: [
              'getting-started',
              'writing',
              'markdown',
              'islands',
              'theme',
              'configuration',
              'seo',
              'search-comments',
              'i18n',
              'encrypt',
              'secret',
              'deploy',
              'migration',
              'faq',
              'advanced',
              'design',
            ],
          },
        },
        encrypt: [
          {
            // Route of docs/content/guide/secret.md (exact string match;
            // `match` also accepts a RegExp tested against the route —
            // see the encrypt guide).
            match: '/guide/secret',
            passwords: ['docs-demo'],
            hint: '演示密码 docs-demo（写在加密指南页里）',
          },
          {
            // English demo page; multi-rule setup also exercises first-match wins.
            match: '/en/guide/secret',
            passwords: ['docs-demo'],
            hint: 'Demo password docs-demo (see the encrypt guide)',
          },
        ],
        // Pagination knobs: non-default values exercise the payload path
        // (site.archivePerPage / feed.rssLimit).
        archive: { perPage: 2 },
        feed: { rssLimit: 10 },
        // Custom footer credit line (desktop footer + mobile drawer).
        footer: { credit: 'Absolute Press Docs' },
        islands: {
          // Site-registered island: demonstrates the config `islands`
          // extension point on top of the six framework builtins.
          Counter: 'docs/islands/Counter.tsx',
        },
      }),
    ),
  ],
  server: {
    port: 3000,
  },
  test: {
    environment: 'node',
    // Cache module transforms on disk between runs; transform time
    // otherwise dominates the unit suite.
    fsModuleCache: true,
    // Shared test doubles for every test file: the shiki markdown-it stub
    // (vitest.setup.ts) keeps renderer init off the unit suite's critical
    // path; code-meta.test.ts opts back into real shiki via doUnmock.
    setupFiles: ['./vitest.setup.ts'],
    // Playwright owns e2e/*.spec.ts; keep vitest on unit tests only.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Unit tests import island components, whose module graph pulls in the
    // build-time virtual module; resolve it to an empty site-island registry.
    alias: {
      // fileURLToPath, not .pathname: on win32 the URL pathname keeps a
      // leading slash (`/C:/...`) which vite cannot resolve.
      'virtual:absolute-press/islands': fileURLToPath(
        new URL(
          './src/client/runtime/test-stubs/empty-site-islands.ts',
          import.meta.url,
        ),
      ),
    },
  },
});

export default config;
