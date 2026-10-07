import { createEffect, For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import type { LocaleInfo, PagePayload } from '../../shared/types';
import { cx } from './cx';

import './NavBar.css';
import { FaIcon } from './FaIcon';
import { useMessages } from './i18n';
import {
  ChevronDownIcon,
  CloseIcon,
  GlobeIcon,
  MenuIcon,
  MoonIcon,
  RssIcon,
  SunIcon,
} from './icons';
import { stripLocalePrefix, withBase } from './links';
import {
  dropLinkClass,
  iconButtonClass,
  railOnlyClass,
} from './navbar/classes';
import { itemHref, NavEntry, slimNavItem } from './navbar/NavEntry';
import { SearchBox } from './navbar/SearchBox';
import { socialIconSet } from './navbar/social-icons';
import { setMenuEpoch, setPinnedKey } from './navbar/state';
import {
  drawerOpen,
  clientBase,
  clientRoute,
  theme,
  toggleDrawer,
  toggleTheme,
} from './state';

function currentLocale(payload: PagePayload): LocaleInfo | undefined {
  return payload.site.locales.find(l => l.key === payload.site.locale);
}

/** Release the pinned menu when a press lands outside any navbar menu entry. */
const dismissOnPointerDown = (e: PointerEvent): void => {
  const target = e.target;
  if (target instanceof Element && !target.closest('li.ap-nav-item'))
    setPinnedKey(null);
};

/** Release the pinned menu on Escape; a focused row would hold its panel open via focusin. */
const dismissOnKeyDown = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') {
    setPinnedKey(null);
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('li.ap-nav-item'))
      active.blur();
  }
};

export function NavBar(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  const base = clientBase;
  // Back/forward and programmatic navigation never click a navbar row:
  // release whatever menu the previous page left open when the route moves.
  createEffect(
    () => clientRoute(),
    () => {
      setPinnedKey(null);
      setMenuEpoch(e => e + 1);
    },
  );
  createEffect(
    () => 0,
    () => {
      document.addEventListener('pointerdown', dismissOnPointerDown, true);
      document.addEventListener('keydown', dismissOnKeyDown);
      return () => {
        document.removeEventListener('pointerdown', dismissOnPointerDown, true);
        document.removeEventListener('keydown', dismissOnKeyDown);
      };
    },
  );
  const homeHref = () =>
    withBase(
      base(),
      `${currentLocale(props.payload)?.prefix ?? ''}/index.html`,
    );
  // nav.align 'center' (老站 look): the top-level lane centers itself in the
  // leftover space via auto margins, so the rail loses its own ml-auto —
  // two competing auto-margin groups would park the lane at a third, not
  // the middle. In-flow centering (vs absolute) can never overlap the
  // brand or the rail on narrow viewports.
  const centered = props.payload.site.navAlign === 'center';
  const localeHref = (target: LocaleInfo): string =>
    withBase(
      base(),
      target.prefix +
        stripLocalePrefix(
          clientRoute(),
          currentLocale(props.payload)?.prefix ?? '',
        ),
    );
  return (
    <header class="fixed inset-x-0 top-0 z-40 h-14 border-b border-[var(--c-border)] bg-[color-mix(in_srgb,var(--c-bg)_85%,transparent)] backdrop-blur-md">
      {/* Full-bleed: the brand sits flush with the page edge (sidebar text
          below it), never inside a centered max-width lane (L2). */}
      <nav class="flex h-full items-center gap-2 px-3 sm:px-6">
        <button
          type="button"
          class={cx(iconButtonClass, 'shrink-0 lg:hidden')}
          aria-label={drawerOpen() ? t.nav.closeMenu : t.nav.openMenu}
          onClick={toggleDrawer}
        >
          <Show when={drawerOpen()} fallback={<MenuIcon class="size-5" />}>
            <CloseIcon class="size-5" />
          </Show>
        </button>
        <a
          href={homeHref()}
          class="flex min-w-0 items-center gap-2.5 text-base font-semibold text-[var(--c-text)]"
        >
          <Show when={props.payload.site.logo}>
            {logo => (
              <img
                src={itemHref(base(), logo())}
                alt=""
                class="size-7 shrink-0 rounded-full object-cover"
              />
            )}
          </Show>
          <span class="truncate">{props.payload.site.title}</span>
        </a>
        <ul
          class={cx(
            'hidden items-stretch lg:flex',
            centered ? 'mx-auto' : 'ml-4',
          )}
        >
          <For each={props.payload.navbar}>
            {item => (
              <NavEntry
                item={slimNavItem(item)}
                base={base()}
                nested={false}
                icons={props.payload.site.icons}
              />
            )}
          </For>
        </ul>
        <div
          class={cx(
            'ap-nav-rail flex shrink-0 items-center gap-1',
            // Below lg the lane is display:none (its auto margins vanish
            // with its box), so the rail keeps its own ml-auto there and
            // hands centering back to the lane from lg up.
            centered ? 'ml-auto lg:ml-0' : 'ml-auto',
          )}
        >
          <Show when={props.payload.site.algolia}>
            {algolia => (
              <SearchBox algolia={algolia()} site={props.payload.site} />
            )}
          </Show>
          <Show when={props.payload.site.locales.length > 1}>
            <div class="group relative">
              <button
                type="button"
                class="flex items-center gap-1 rounded-md p-2 text-[var(--c-text-2)] transition duration-150 ease-out hover:bg-[var(--c-bg-soft)] hover:text-[var(--c-text)]"
                aria-label={t.nav.switchLocale}
              >
                <GlobeIcon class="size-5" />
                <span class="hidden text-sm sm:inline">
                  {currentLocale(props.payload)?.label}
                </span>
                <ChevronDownIcon class="size-3.5 opacity-60" />
              </button>
              <ul class="ap-nav-drop invisible absolute top-full right-0 z-50 min-w-36 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg)] p-1.5 opacity-0 shadow-[var(--c-shadow)] transition duration-150 ease-out group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <For each={props.payload.site.locales}>
                  {l => (
                    <li>
                      <a
                        href={localeHref(l)}
                        class={cx(
                          dropLinkClass,
                          l.key === props.payload.site.locale &&
                            'ap-nav-drop-active',
                        )}
                        hreflang={l.lang}
                        // Click-focus would hold the panel open via
                        // group-focus-within after navigation.
                        onClick={e => e.currentTarget.blur()}
                      >
                        {l.label}
                      </a>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>
          <For each={props.payload.site.social}>
            {s => (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                title={s.title}
                aria-label={s.title}
                class={cx(iconButtonClass, railOnlyClass)}
              >
                <FaIcon
                  name={s.icon}
                  icons={socialIconSet(props.payload.site.icons)}
                  class="opacity-90"
                />
              </a>
            )}
          </For>
          <a
            href={withBase(base(), '/rss.xml')}
            target="_blank"
            rel="noreferrer"
            title={t.nav.rss}
            aria-label={t.nav.rss}
            class={cx(iconButtonClass, railOnlyClass)}
          >
            <RssIcon class="size-5" />
          </a>
          <button
            type="button"
            class={iconButtonClass}
            aria-label={
              theme() === 'dark' ? t.nav.switchToLight : t.nav.switchToDark
            }
            onClick={toggleTheme}
          >
            {/* Icon mirrors the CURRENT theme (sun in light, moon in dark);
                the label keeps describing the toggle action. */}
            <Show
              when={theme() === 'dark'}
              fallback={<SunIcon class="size-5" />}
            >
              <MoonIcon class="size-5" />
            </Show>
          </button>
        </div>
      </nav>
    </header>
  );
}
