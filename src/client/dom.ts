import {
  insert,
  registerDelegatedRoot,
  unregisterDelegatedRoot,
} from '@solidjs/web';
import { createComponent, createRoot } from 'solid-js';
import type { Component } from 'solid-js';

/** Disposer of every mounted root, keyed by its container element. */
const rootDisposers = new WeakMap<Element, () => void>();

/**
 * Mount a Solid component into an existing DOM container (MPA, no hydrate).
 * The container is marked `data-ap-root` and the disposer is tracked, so
 * transient mounts (islands, per-page graphs, remounted chrome) can be
 * disposed when client-side navigation replaces their subtree.
 */
export function mountComponent<P extends Record<string, unknown>>(
  Comp: Component<P>,
  el: Element,
  props: P,
): void {
  // Solid 2.0 routes compiled (delegated) events through per-container
  // listeners: an unregistered container never gets them, so every
  // delegated handler (onClick etc.) is dead. render() registers the
  // container internally; custom mounts must do the same.
  registerDelegatedRoot(el as HTMLElement);
  const dispose = createRoot(disposer => {
    // Accessor form (as render() does): reactive control flow at the
    // component root (<Show>, fragments returning render closures) must
    // mount through insert(); a naive append stringifies closures into
    // text nodes and never re-renders.
    insert(el as HTMLElement, () => createComponent(Comp, props));
    return disposer;
  });
  el.setAttribute('data-ap-root', '');
  rootDisposers.set(el, dispose);
}

/**
 * Dispose the root mounted in `el` (if any) and clear its marker.
 */
export function disposeRoot(el: Element): void {
  if (!el.hasAttribute('data-ap-root')) return;
  rootDisposers.get(el)?.();
  rootDisposers.delete(el);
  // The delegated-root map is a strong Map keyed by the container: without
  // this the entry keeps the whole disposed subtree alive forever.
  unregisterDelegatedRoot(el as HTMLElement);
  el.removeAttribute('data-ap-root');
}

/**
 * Register a component's root element as its own delegated-event container.
 * Solid 2.0 dispatches delegated events (onClick etc.) from listeners on
 * registered containers only: mountComponent registers each mount point,
 * but a component whose host gets re-parented out of it (ThemeContent moves
 * its hosts under the body h1, leaving #ap-chrome) silently loses every
 * delegated handler. A component rooted in such a host registers its root
 * element itself; the listener travels with the element through any later
 * moves. Returns the disposer (wire to onCleanup).
 */
export function registerDelegatedHost(el: HTMLElement): () => void {
  registerDelegatedRoot(el);
  return () => unregisterDelegatedRoot(el);
}

/**
 * Approach margin for below-fold lazy mounts (related graph, comments):
 * generous vertical lead so the chunk / script is ready before the reader
 * actually arrives.
 */
export const NEAR_ROOT_MARGIN = '600px 0px';

/**
 * Whether any entry in an IntersectionObserver batch is visible — the shared
 * "should the lazy thing load / keep running" decision behind every
 * viewport-based deferral in the theme.
 */
export function nearView(
  entries: readonly { isIntersecting: boolean }[],
): boolean {
  return entries.some(e => e.isIntersecting);
}

/**
 * Call `onNear` once, when `el` comes within `rootMargin` of the viewport;
 * the observer disconnects itself after firing. Environments without
 * IntersectionObserver degrade to an immediate call — lazy mounts fall back
 * to eager, never to missing. Returns the disconnector.
 */
export function observeNearOnce(
  el: Element,
  rootMargin: string,
  onNear: () => void,
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onNear();
    return () => undefined;
  }
  // The fired flag makes the once-semantics explicit: a single batch or a
  // stray late delivery can never trigger onNear twice.
  let fired = false;
  const io = new IntersectionObserver(
    entries => {
      if (fired || !nearView(entries)) return;
      fired = true;
      io.disconnect();
      onNear();
    },
    { rootMargin },
  );
  io.observe(el);
  return () => io.disconnect();
}

/**
 * Dispose every mounted root under `root`, except anything inside `keep`
 * (the persistent chrome slot). Markers are cleared so a later hydration
 * pass re-mounts them fresh.
 */
export function disposeRootsUnder(
  root: ParentNode,
  keep?: Element | null,
): void {
  // Snapshot: disposers may mutate the subtree while the loop runs.
  for (const el of Array.from(
    root.querySelectorAll<HTMLElement>('[data-ap-root]'),
  )) {
    if (keep && (el === keep || keep.contains(el))) continue;
    disposeRoot(el);
  }
}
