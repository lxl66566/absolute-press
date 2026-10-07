declare module 'virtual:uno.css';

declare module 'virtual:absolute-press/islands' {
  import type { IslandComponent } from './hydrate';

  const registry: Record<string, IslandComponent>;
  export default registry;
}
