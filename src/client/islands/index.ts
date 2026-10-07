/**
 * Framework built-in islands. Registration into the runtime registry
 * (`src/client/runtime/islands.ts`) is done centrally by the maintainer:
 *
 *   import { Giscus, PasswordGate, ZoomedImg } from '../islands';
 *   export const builtinIslands = { Giscus, PasswordGate, ZoomedImg };
 */
export { Giscus } from './Giscus';
export type { GiscusProps } from './Giscus';
export { PasswordGate } from './PasswordGate';
export type { PasswordGateProps } from './PasswordGate';
export { ZoomedImg } from './ZoomedImg';
export type { ZoomedImgProps } from './ZoomedImg';
export { default as Mermaid } from './Mermaid';
export { default as G2Plot } from './G2Plot';
export type { G2PlotConfig, G2PlotKind } from './G2Plot';
export { ExpandableList } from './ExpandableList';
export type { ExpandableListProps } from './ExpandableList';
