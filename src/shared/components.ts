/**
 * Built-in build components: markdown tags rendered to their final static
 * HTML at build time (no hydration placeholder, no client JS). Islands stay
 * the tool for interactive components; build components are pure build-time
 * derivations of site data. This registry is the single source of truth for
 * the markdown extraction name set, the site-config disable union, and the
 * docs inventory table — adding a built-in is one row here plus a renderer
 * in src/node/build/components.ts.
 */
export interface BuildComponentSpec {
  /** PascalCase tag usable in markdown. */
  name: string;
  /** One-line English description (docs table, config error listing). */
  description: string;
}

export const BUILTIN_BUILD_COMPONENTS = [
  {
    name: 'RecentArticles',
    description: 'Latest and recently updated article columns',
  },
] as const satisfies readonly BuildComponentSpec[];

export type BuiltinBuildComponentName =
  (typeof BUILTIN_BUILD_COMPONENTS)[number]['name'];

/** All built-in build component tag names, registry order. */
export const BUILD_COMPONENT_NAMES: readonly BuiltinBuildComponentName[] =
  BUILTIN_BUILD_COMPONENTS.map(component => component.name);

/** True when `name` is a built-in build component tag. */
export function isBuildComponentName(name: string): boolean {
  return (BUILD_COMPONENT_NAMES as readonly string[]).includes(name);
}
