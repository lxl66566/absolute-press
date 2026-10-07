/**
 * Public framework entry: `import { absolutePress, defineSiteConfig } from 'absolute-press'`.
 *
 * Source TS is exported directly (types point at .ts too); consumers load it
 * through vite/TS tooling. Relative specifiers here carry explicit `.ts`
 * extensions because vite/esbuild resolves them natively in TS sources.
 * Plain node ESM type-stripping is NOT a supported consumption path: loading
 * this graph flag-free needs Node >= 22.18 / 23.6, while `engines` (>= 20.19)
 * only guarantees the vite/esbuild path.
 */
export { absolutePress } from './build/plugin.ts';
export type { AbsolutePressConfig, NavConfig } from './config.ts';
// `defineSiteConfig` is the canonical name in vite.config.ts; `defineConfig`
// stays as the original alias (it shadows vitest's helper of the same name,
// so prefer the explicit one when both imports live in one file).
export { defineConfig, defineConfig as defineSiteConfig } from './config.ts';
// Site-config-facing contracts: everything `SiteConfig` references.
export type {
  LocaleConfig,
  RelatedDepth,
  SiteConfig,
  SocialEntry,
  StrictLinks,
} from '../shared/types.ts';
