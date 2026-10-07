/**
 * Navbar class constants (pure data). The strings are DOM contract — keep
 * them byte-identical when moving code around.
 */

const topLinkClass =
  'flex h-14 cursor-pointer items-center gap-0.5 whitespace-nowrap border-b-2 border-transparent px-2.5 text-sm text-[var(--c-text-2)] transition duration-150 ease-out hover:text-[var(--c-text)] xl:px-3';
const dropLinkClass =
  'flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm text-[var(--c-text-2)] transition duration-150 ease-out hover:bg-[var(--c-bg-soft)] hover:text-[var(--c-text)]';
const iconButtonClass =
  'flex cursor-pointer items-center justify-center rounded-md p-2 text-[var(--c-text-2)] transition duration-150 ease-out hover:bg-[var(--c-bg-soft)] hover:text-[var(--c-text)]';
// Social/RSS live in the mobile drawer below lg (M4): the top bar keeps
// hamburger + brand + nav + search + theme. The search INPUT collapses to
// an icon below xl: eight nowrap top items + the full rail only fit from
// 1280 up, and items must never stack into vertical columns instead.
const railOnlyClass = 'hidden lg:flex';
// Panel caption for configured nav groups (老站-style 游戏/艺术/其他 headers).
const dropCaptionClass =
  'px-3 pb-1 pt-2.5 text-xs font-medium text-[var(--c-text-2)]';

export {
  dropCaptionClass,
  dropLinkClass,
  iconButtonClass,
  railOnlyClass,
  topLinkClass,
};
