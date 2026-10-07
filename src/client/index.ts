/**
 * Client-side public API of the framework. Site islands import from
 * `absolute-press/client` (package exports subpath) — the node entry (`.`) is
 * build-time only and pulling it into the client bundle would be wrong.
 */
export { hydrateIslands, islandRegistry } from './runtime/islands';
export { pagePayload } from './runtime/payload';
export type { IslandComponent, IslandProps } from './runtime/islands';
// Site-island toolkit: class join, boolean flag props, page-language UI copy
// and manual mounting — the shared building blocks behind the built-in
// islands, so site islands don't re-implement or deep-import them.
export { cx } from './theme/cx';
export { flagOn } from './islands/props';
export { formatMessage, pageMessages } from './theme/i18n';
export type { Messages } from './theme/i18n';
export { mountComponent } from './dom';
// Shared data contracts: sites customizing chrome (navbar/sidebar/archive)
// or islands consume the payload types through this entry.
export type {
  ArticleInfo,
  Heading,
  LocaleInfo,
  NavItem,
  PageFrontmatter,
  PageMeta,
  PagePayload,
  RelatedEdgeRef,
  RelatedLink,
  SidebarItem,
  SocialEntry,
} from '../shared/types';
// Narrowing helper for the NavItem union (paired with the types above).
export { navLinkOf } from '../shared/types';
