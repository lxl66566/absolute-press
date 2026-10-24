import { parseHTML } from 'linkedom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { disposeRoot } from '../../dom';
import { hydrateIslands, setIslandRegistry } from '../hydrate';
import type { IslandComponent } from '../hydrate';

// In the node test env @solidjs/web resolves to its server build, whose
// delegated-root API throws; dom.ts only needs the three client calls, so
// stub them (insert appends the rendered value, which covers text islands).
vi.mock('@solidjs/web', () => ({
  insert: (el: Element, value: () => unknown): void => {
    const v = value();
    if (typeof v === 'string' || v instanceof Node) el.append(v);
  },
  registerDelegatedRoot: () => {},
  unregisterDelegatedRoot: () => {},
}));

/** Island stand-in rendering a marker text (mountComponent inserts it). */
const Echo: IslandComponent = () => 'mounted';

/**
 * hydrateIslands walks whatever ParentNode it is handed, but mountComponent
 * and the solid runtime touch the global document — borrow linkedom's
 * (same approach as payload.test.ts).
 */
function useDocument(html: string): Document {
  const doc = parseHTML(html).document;
  vi.stubGlobal('document', doc);
  return doc;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setIslandRegistry({});
});

describe('hydrateIslands', () => {
  it('returns the placeholders it mounted, marked and rooted', () => {
    const doc = useDocument('<div id="host"></div>');
    setIslandRegistry({ Echo });
    const host = doc.getElementById('host')!;
    host.innerHTML = '<div data-ap-island="Echo"><p>pre</p></div>';
    const mounted = hydrateIslands(host);
    expect(mounted).toHaveLength(1);
    const el = mounted[0]!;
    expect(el.dataset.apIslandMounted).toBe('1');
    expect(el.hasAttribute('data-ap-root')).toBe(true);
    // The placeholder HTML became childrenHtml; the component replaced it.
    expect(el.textContent).toBe('mounted');
  });

  it('returns [] and warns for an unregistered island', () => {
    const doc = useDocument('<div id="host"></div>');
    setIslandRegistry({});
    const host = doc.getElementById('host')!;
    host.innerHTML = '<div data-ap-island="Ghost"><p>x</p></div>';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(hydrateIslands(host)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ghost'));
  });

  it('never hydrates twice: the mounted marker skips re-runs', () => {
    const doc = useDocument('<div id="host"></div>');
    setIslandRegistry({ Echo });
    const host = doc.getElementById('host')!;
    host.innerHTML = '<div data-ap-island="Echo"><p>pre</p></div>';
    expect(hydrateIslands(host)).toHaveLength(1);
    expect(hydrateIslands(host)).toEqual([]);
  });

  it('disposeRoot clears the root but not the hydration marker', () => {
    const doc = useDocument('<div id="host"></div>');
    setIslandRegistry({ Echo });
    const host = doc.getElementById('host')!;
    host.innerHTML = '<div data-ap-island="Echo"><p>pre</p></div>';
    const [first] = hydrateIslands(host);
    disposeRoot(first!);
    expect(first!.hasAttribute('data-ap-root')).toBe(false);
    // The mounted marker persists on purpose: a disposed placeholder never
    // re-hydrates in place — re-entering list rows re-apply their source
    // innerHTML, which carries fresh unmarked placeholders.
    expect(hydrateIslands(host)).toEqual([]);
  });
});
