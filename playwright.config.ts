import { defineConfig, devices } from 'playwright/test';

// Local preview must bypass any ambient HTTP(S)_PROXY: the webServer readiness
// probe and page requests target localhost only.
process.env.NO_PROXY = ['localhost', '127.0.0.1', process.env.NO_PROXY]
  .filter(Boolean)
  .join(',');

/**
 * E2E tests against the single docs site plus its dev server:
 * - built site (dist/, `pnpm build`) on 127.0.0.1:4173 — all suites
 * - dev server on 127.0.0.1:5173 — e2e/dev-fouc.spec.ts (dev-only
 *   render-blocking CSS injection; needs no build output)
 *
 * `pnpm test:e2e` builds the site first, then runs all suites; the webServers
 * below only serve the existing build output. Running
 * `pnpm exec playwright test` directly therefore requires a prior build.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Bind IPv4 explicitly: default vite preview listens on ::1 only, which
      // makes 127.0.0.1 readiness probes fail with ECONNREFUSED.
      command:
        'pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      // Docs site under `vite dev` (server.port 3000 in vite.config.ts is
      // overridden): the dev FOUC suite pins the serve-mode head contract.
      command: 'pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
