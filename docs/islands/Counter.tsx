import type { IslandComponent } from 'absolute-press/client';
import { createEffect, createSignal } from 'solid-js';

/**
 * Docs-site custom island, registered via site config `islands` in
 * vite.config.docs.ts. JSX-free so tsc stays green before @solidjs/web
 * types are available. Renders a counter button with :initial / label props.
 */
const Counter: IslandComponent = props => {
  const initial = typeof props['initial'] === 'number' ? props['initial'] : 0;
  const label = typeof props['label'] === 'string' ? props['label'] : 'count';
  const [count, setCount] = createSignal(initial);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ap-demo-counter';
  btn.addEventListener('click', () => setCount(c => c + 1));
  // Solid 2.0 effect API: (compute, effectFn).
  createEffect(
    () => count(),
    v => {
      btn.textContent = `${label}: ${v}`;
    },
  );
  return btn;
};

export default Counter;
