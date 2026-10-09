import { createEffect, createSignal, For, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import type {
  PagePayload,
  ProfileChip,
  ProfileTaxonomy,
  SidebarItem,
} from '../../shared/types';
import { ArchiveView } from './ArchiveView';
import { ArticleFooter, FooterCredits } from './ArticleFooter';
import { ArticleMeta } from './ArticleMeta';
import { BACK_TO_TOP_THRESHOLD_PX } from './constants';
import { cx } from './cx';

import './MobileDrawer.css';
import { FaIcon } from './FaIcon';
import { HomeFeed } from './HomeFeed';
import { useMessages, type Messages } from './i18n';
import { ArrowUpIcon, ChevronDownIcon, RssIcon } from './icons';
import { InlineToc } from './InlineToc';
import { parseArchiveRoute, withBase } from './links';
import { NavBar } from './NavBar';
import { socialIconSet } from './navbar/social-icons';
import { activeGroupKeys, allGroupKeys } from './sidebar-tree';
import { SidebarTree } from './SidebarTreeRow';
import {
  closeDrawer,
  clientBase,
  clientRoute,
  drawerOpen,
  gateUnlocked,
} from './state';

/**
 * Theme chrome entry.
 *
 * The shell provides four containers: #ap-nav / #ap-sidebar /
 * #ap-content / #ap-toc. Mount each chunk into its own container
 * (Solid 2.0 exposes no Portal/render; use the runtime's pattern):
 *
 *   import '../styles/theme.css'; // required: bundle css asset feeds cssHrefs
 *   const mount = (Comp, el) =>
 *     createRoot(d => (el.append(...toNodes(createComponent(Comp, { payload }))), d));
 *   mount(ThemeNav, document.getElementById('ap-nav'));
 *   mount(ThemeSidebar, document.getElementById('ap-sidebar'));
 *   mount(ThemeToc, document.getElementById('ap-toc'));
 *   // prepend a slot so chrome sits above the static body:
 *   const slot = document.createElement('div');
 *   document.getElementById('ap-content').prepend(slot);
 *   mount(ThemeContent, slot);
 *
 * The chunks share state via module signals in ./state.ts, so separate
 * roots stay in sync.
 */

/**
 * Drawer collapse set (member = collapsed): every group off the active path
 * starts folded, so the first level reads as a summary and the whole article
 * tree stays reachable. Same polarity as the rail's collapse set.
 */
function drawerCollapsed(
  items: SidebarItem[],
  route: string,
): ReadonlySet<string> {
  const open = new Set(activeGroupKeys(items, route));
  return new Set(allGroupKeys(items).filter(key => !open.has(key)));
}

/** One collapsible chip group of the drawer profile section. */
function DrawerProfileGroup(props: {
  label: string;
  chips: ProfileChip[];
  /** Category chips carry count badges; tag chips stay plain. */
  counts: boolean;
}): SolidElement {
  return (
    <details class="ap-drawer-profile__group">
      <summary class="ap-drawer-profile__summary">
        <ChevronDownIcon class="ap-drawer-profile__chevron" />
        <span class="ap-drawer-profile__label">{props.label}</span>
        <span class="ap-drawer-profile__count">{props.chips.length}</span>
      </summary>
      <ul class="ap-drawer-profile__chips">
        <For each={props.chips}>
          {chip => (
            <li>
              <a
                class="ap-drawer-profile__chip"
                href={withBase(clientBase(), chip.route)}
                onClick={closeDrawer}
              >
                {chip.name}
                {props.counts && (
                  <span class="ap-drawer-profile__chip-count">
                    {chip.count}
                  </span>
                )}
              </a>
            </li>
          )}
        </For>
      </ul>
    </details>
  );
}

/**
 * Drawer profile section (config `profile`, mobile only): a plain-number
 * stats row plus the category/tag chip groups behind native disclosures.
 */
function DrawerProfile(props: {
  profile: ProfileTaxonomy;
  msg: Messages;
}): SolidElement {
  const t = props.msg;
  return (
    <div class="ap-drawer-profile">
      <div class="ap-drawer-profile__stats">
        <span class="ap-drawer-profile__stat">
          <b>{props.profile.articles}</b>
          <span>{t.profile.posts}</span>
        </span>
        <span class="ap-drawer-profile__stat">
          <b>{props.profile.categories.length}</b>
          <span>{t.profile.categories}</span>
        </span>
        <span class="ap-drawer-profile__stat">
          <b>{props.profile.tags.length}</b>
          <span>{t.profile.tags}</span>
        </span>
      </div>
      <DrawerProfileGroup
        label={t.profile.categories}
        chips={props.profile.categories}
        counts
      />
      <DrawerProfileGroup
        label={t.profile.tags}
        chips={props.profile.tags}
        counts={false}
      />
    </div>
  );
}

/** Lightweight drawer footer: brand row + social links (M4 overflow). */
function DrawerFooter(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  const base = clientBase;
  // The profile section (config `profile`) inserts between the social row
  // and the credits; the brand row above stays exactly as before.
  const profile = () => props.payload.site.profile;
  return (
    <div class="ap-drawer-footer">
      <Show when={props.payload.site.logo}>
        {logo => (
          <img
            class="ap-drawer-footer__avatar"
            src={withBase(base(), logo())}
            alt=""
          />
        )}
      </Show>
      <span class="ap-drawer-footer__title">{props.payload.site.title}</span>
      <div class="ap-drawer-footer__social">
        <For each={props.payload.site.social}>
          {s => (
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              title={s.title}
              aria-label={s.title}
            >
              <FaIcon
                name={s.icon}
                icons={socialIconSet(props.payload.site.icons)}
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
        >
          <RssIcon class="size-5" />
        </a>
      </div>
      <Show when={profile()}>
        {p => <DrawerProfile profile={p()} msg={t} />}
      </Show>
      {/* Site credits: on mobile the desktop footer is hidden, so the
          line lives here at the drawer's bottom instead. */}
      <div class="ap-drawer-footer__credits">
        <FooterCredits credit={props.payload.site.footerCredit} />
      </div>
    </div>
  );
}

/**
 * Mobile drawer panel (H6). Rendered by ThemeNav next to the navbar header:
 * fixed positioning must not nest under the header (its backdrop-filter
 * would become the containing block).
 */
function MobileDrawer(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  // First level only; the active path starts expanded so the current page
  // is visible without extra taps.
  const [collapsedKeys, setCollapsedKeys] = createSignal<ReadonlySet<string>>(
    drawerCollapsed(props.payload.sidebar, clientRoute()),
  );
  // Client-side navigation re-derives the expanded path per route, exactly
  // like a full page load would.
  createEffect(
    () => clientRoute(),
    route => {
      setCollapsedKeys(drawerCollapsed(props.payload.sidebar, route));
    },
  );
  const toggle = (key: string): void => {
    setCollapsedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  // Scroll lock mirrors the rail contract (mobile only). A resize listener
  // releases it when the viewport crosses lg — rotating a tablet with the
  // drawer open must not leave the page unscrollable at desktop width. This
  // is the only body lock since the legacy sidebar open state was removed.
  createEffect(
    () => drawerOpen(),
    open => {
      const apply = (): void => {
        document.body.style.overflow =
          open && window.innerWidth < 1024 ? 'hidden' : '';
      };
      apply();
      if (!open) return;
      window.addEventListener('resize', apply);
      return () => {
        window.removeEventListener('resize', apply);
        document.body.style.overflow = '';
      };
    },
  );
  return (
    <>
      <Show when={drawerOpen()}>
        <div
          class="ap-drawer-backdrop"
          aria-hidden="true"
          onClick={closeDrawer}
        />
      </Show>
      <nav
        class={cx('ap-drawer-panel', drawerOpen() && 'ap-open')}
        aria-hidden={drawerOpen() ? 'false' : 'true'}
      >
        <ul class="ap-drawer-tree">
          <SidebarTree
            items={props.payload.sidebar}
            collapsed={collapsedKeys}
            toggle={toggle}
            onNavigate={closeDrawer}
            headingToggles
            activeLinkClass="ap-drawer-link-active bg-[var(--c-bg-soft)]"
            msg={t}
            icons={props.payload.site.icons}
          />
        </ul>
        <DrawerFooter payload={props.payload} />
      </nav>
    </>
  );
}

/** Nav chunk: sticky header plus the mobile drawer it toggles. */
export function ThemeNav(props: { payload: PagePayload }): SolidElement {
  return (
    <>
      <NavBar payload={props.payload} />
      <MobileDrawer payload={props.payload} />
    </>
  );
}

export { SideBar as ThemeSidebar } from './SideBar';
export { Toc as ThemeToc } from './Toc';

function scrollToTop(): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}

function BackToTop(props: { label: string }): SolidElement {
  const [visible, setVisible] = createSignal(false);
  const onScroll = (): void => {
    setVisible(window.scrollY > BACK_TO_TOP_THRESHOLD_PX);
  };
  createEffect(
    () => 0,
    () => {
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    },
  );
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={scrollToTop}
      class={cx(
        'fixed right-6 bottom-6 z-30 rounded-full border border-[var(--c-border)] bg-[var(--c-bg)] p-2.5 text-[var(--c-text-2)] shadow-[var(--c-shadow)] transition duration-150 ease-out hover:text-[var(--c-accent)]',
        visible()
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <ArrowUpIcon class="size-5" />
    </button>
  );
}

/**
 * Chrome rendered above the static body of #ap-content:
 * archive list / home feed / article meta row / inline toc, plus back-to-top.
 */
export function ThemeContent(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  const isArchive = () => parseArchiveRoute(props.payload.page.route) !== null;
  const isFeed = () => !isArchive() && props.payload.articles !== undefined;
  const hasMeta = () => {
    if (isArchive() || isFeed()) return false;
    const { page } = props.payload;
    return Boolean(
      page.createdAt ??
      page.updatedAt ??
      page.frontmatter.icon ??
      page.frontmatter.category?.length ??
      page.frontmatter.tag?.length,
    );
  };
  // The chrome slot is prepended above the static body, but the article
  // header reads title-first (old site: h1 -> meta, L7). The meta host is
  // therefore moved under the body's h1 once mounted (the inline toc host
  // rides along, landing below the meta row), while the footer host
  // goes to the shell's #ap-footer container (body flex column pins it to
  // the page bottom, below the related graph and the comment section) —
  // every page gets the footer, not just articles. Gated pages render their
  // h1 inside the gate placeholder only after unlock (a locked gate holds
  // the body as props, not DOM), so the effect tracks the shared
  // gateUnlocked signal: locked pages keep the meta in the slot, and the
  // unlock flip re-runs the lookup against the gate content. Render effects
  // settle before user effects, so the lookup defers a microtask — same
  // pattern as the gate's own rebuild. The chunk remounts per client-side
  // navigation (remountPageChrome), so the mount run happens once per page.
  let metaHost!: HTMLDivElement;
  let tocHost!: HTMLDivElement;
  let footerHost!: HTMLDivElement;
  createEffect(
    () => gateUnlocked(),
    () => {
      queueMicrotask(() => {
        const content = document.getElementById('ap-content');
        if (!content) return;
        // Unlocked gated pages keep their h1 inside the gate content.
        const h1 = content.querySelector<HTMLElement>(
          ':scope > h1, :scope .ap-gate__content > h1',
        );
        if (hasMeta() && metaHost && h1) {
          h1.insertAdjacentElement('afterend', metaHost);
        }
        // The inline toc rides below the meta row (below the article date);
        // pages without a meta row hang it directly under the h1 — both are
        // the top-of-the-body placement.
        if (tocHost && h1) {
          const anchor = hasMeta() && metaHost ? metaHost : h1;
          anchor.insertAdjacentElement('afterend', tocHost);
        }
        if (footerHost) {
          document.getElementById('ap-footer')?.append(footerHost);
        }
      });
    },
  );
  return (
    <>
      <Show when={isArchive()}>
        <ArchiveView payload={props.payload} />
      </Show>
      <Show when={isFeed()}>
        <HomeFeed payload={props.payload} />
      </Show>
      <div ref={metaHost}>
        <Show when={hasMeta()}>
          <ArticleMeta payload={props.payload} />
        </Show>
      </div>
      <div ref={tocHost}>
        <InlineToc payload={props.payload} />
      </div>
      <div ref={footerHost}>
        <ArticleFooter payload={props.payload} />
      </div>
      <BackToTop label={t.toc.backToTop} />
    </>
  );
}
