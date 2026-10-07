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
        title: 'Absolute Press',
        description:
          'Absolute Press：SolidJS 静态博客框架官方文档。MPA SSG + islands 架构。',
        hostname: 'https://lxl66566.github.io/absolute-press',
        locales: {
          en: { lang: 'en', label: 'English' },
        },
        // Docs landing page: the prose intro (hero/features/reading paths)
        // is the page's primary; the paginated article feed would push it
        // below the fold and read like a blog archive.
        home: { feed: false },
        // Icon key -> full SVG string; frontmatter `icon` must reference a
        // key registered here.
        icons: {
          rocket:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M156.6 384.9L125.7 354c-8.5-8.5-11.5-20.8-7.7-32.2c3-8.9 7-20.5 11.8-33.8L24 288c-8.6 0-16.6-4.6-20.9-12.1s-4.2-16.7 .2-24.1l52.5-88.5c13-21.9 36.5-35.3 61.9-35.3l82.3 0c2.4-4 4.8-7.7 7.2-11.3C289.1-4.1 411.1-8.1 483.9 5.3c11.6 2.1 20.6 11.2 22.8 22.8c13.4 72.9 9.3 194.8-111.4 276.7c-3.5 2.4-7.3 4.8-11.3 7.2l0 82.3c0 25.4-13.4 49-35.3 61.9l-88.5 52.5c-7.4 4.4-16.6 4.5-24.1 .2s-12.1-12.2-12.1-20.9l0-107.2c-14.1 4.9-26.4 8.9-35.7 11.9c-11.2 3.6-23.4 .5-31.8-7.8zM384 168a40 40 0 1 0 0-80 40 40 0 1 0 0 80z"/></svg>',
          star: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>',
        },
        algolia: {
          appId: 'UMGMTUUIFU',
          apiKey: '6e1820d0f954590466468855790a2440',
          indexName: 'algolia',
        },
        giscus: {
          repo: 'lxl66566/lxl66566.github.io',
          repoId: 'R_kgDOHRyDvA',
          category: 'General',
          categoryId: 'DIC_kwDOHRyDvM4CQSP1',
        },
        googleAnalytics: 'G-MKRDBH1ZP1',
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
        encrypt: [
          {
            // Route of docs/content/guide/secret.md (exact string match;
            // `match` also accepts a RegExp tested against the route —
            // see the encrypt guide).
            match: '/guide/secret.html',
            passwords: ['docs-demo'],
            hint: '演示密码 docs-demo（写在加密指南页里）',
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
