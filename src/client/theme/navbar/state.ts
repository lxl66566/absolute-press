import { createSignal } from 'solid-js';

/**
 * Module-level navbar menu state, shared by NavBar and NavEntry (they live
 * in separate files but the same chunk, so module signals act as the store).
 */

/**
 * At most one navbar menu is pinned open at a time. A click on a link-less
 * entry toggles its pin; clicking elsewhere or pressing Escape releases it.
 * While a pin exists, hovering another entry moves it there (menu-bar
 * mode), so the open panel never duplicates.
 */
const [pinnedKey, setPinnedKey] = createSignal<string | null>(null);

/**
 * Menus never outlive a visit: a navigating row click bumps this epoch (and
 * client-side navigation bumps it again), so every entry drops the hover and
 * focus held over the previous page. The chrome is mounted once for the
 * whole session — a pointer parked where the panel was gets no fresh
 * pointerenter, and touch never sends pointerleave, so without this reset a
 * panel would hang over the new page.
 */
const [menuEpoch, setMenuEpoch] = createSignal(0);

export { menuEpoch, pinnedKey, setMenuEpoch, setPinnedKey };
