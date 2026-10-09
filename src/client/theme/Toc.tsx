import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import type { PagePayload } from '../../shared/types';
import { flashAnchorTarget } from './anchor-highlight';
import { FOLD_SETTLE_MS } from './constants';
import { cx } from './cx';
import { useMessages } from './i18n';
import type { Messages } from './i18n';
import { ChevronDownIcon } from './icons';
import { gateUnlocked } from './state';
import {
  buildTocTree,
  flattenTocSlugs,
  TOC_FOLD_THRESHOLD,
  tocDescendsFrom,
  tocEntryCount,
  type TocNode,
} from './toc-tree';

import './Toc.css';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// FOLD_SETTLE_MS lives in ./constants: a fold expansion animates its height
// over 160ms (.ap-collapse in theme.css); row positions read short until it
// settles, so reveals re-aim just past the end.

function TocEntry(props: {
  node: TocNode;
  /** Nesting level (0-based); text indents one step per level. */
  depth: number;
  active: () => string | null;
  onNavigate: (slug: string, e: MouseEvent) => void;
  /** Shared i18n messages (aria labels for the fold toggle). */
  msg: Messages;
  /** Folded mode (L12): this top-level row's children sit behind a toggle. */
  fold?: { expanded: () => boolean; toggle: () => void };
}): SolidElement {
  const slug = () => props.node.heading.slug;
  const collapsible = () =>
    props.fold !== undefined && props.node.children.length > 0;
  return (
    <li>
      <div class="ap-toc-row">
        {/* href is the no-JS fallback; JS navigation smooth-scrolls and syncs the hash */}
        <a
          href={`#${slug()}`}
          title={props.node.heading.text}
          style={{ 'padding-left': `${0.75 + props.depth * 0.75}rem` }}
          class={cx(
            '-ml-px block border-l-2 py-1 text-sm transition duration-150 ease-out',
            props.active() === slug()
              ? 'border-[var(--c-accent)] font-medium text-[var(--c-accent)]'
              : 'border-transparent text-[var(--c-text-2)] hover:border-[var(--c-border)] hover:text-[var(--c-text)]',
          )}
          onClick={e => props.onNavigate(slug(), e)}
        >
          {props.node.heading.text}
        </a>
        <Show when={collapsible()}>
          <button
            type="button"
            class="ap-toc-row__chevron"
            aria-expanded={props.fold?.expanded() ? 'true' : 'false'}
            aria-label={
              props.fold?.expanded()
                ? props.msg.sidebar.collapseGroup
                : props.msg.sidebar.expandGroup
            }
            onClick={() => props.fold?.toggle()}
          >
            <ChevronDownIcon
              class={cx(
                'size-4 transition-transform duration-150 ease-out',
                !props.fold?.expanded() && '-rotate-90',
              )}
            />
          </button>
        </Show>
      </div>
      <Show when={props.node.children.length > 0}>
        <ul
          class={cx(
            collapsible() && 'ap-collapse ap-toc-group',
            collapsible() && !props.fold?.expanded() && 'ap-collapsed',
          )}
        >
          <For each={props.node.children}>
            {child => (
              <TocEntry
                node={child}
                depth={props.depth + 1}
                active={props.active}
                onNavigate={props.onNavigate}
                msg={props.msg}
              />
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}

/**
 * Shared visibility for both toc placements (rail Toc and the inline card
 * in TocInline.tsx): a non-empty outline only, and a locked password gate
 * keeps its body's outline out of the list until unlock (the accessor is
 * reactive on gateUnlocked, so the Show flips when the gate opens).
 */
export function useTocVisible(
  tree: readonly TocNode[],
  payload: PagePayload,
): () => boolean {
  return () =>
    tree.length > 0 && (payload.encrypted === undefined || gateUnlocked());
}

/**
 * Outline body shared by the fixed rail (Toc) and the inline card
 * (TocInline.tsx): spy-highlighted rows, oversized-outline folding and
 * anchor navigation. The outline is fixed for the component's lifetime —
 * every placement remounts with the new payload per client-side navigation.
 * `rail` enables the reveal, which chases the highlight inside the fixed,
 * viewport-spanning #ap-toc; an inline placement sits in the page flow and
 * must never scroll the document, so it opts out.
 */
export function TocOutline(props: {
  tree: TocNode[];
  /** Shared i18n messages (aria labels for the fold toggles). */
  msg: Messages;
  rail: boolean;
}): SolidElement {
  const tree = props.tree;
  const slugs = flattenTocSlugs(tree);
  const [active, setActive] = createSignal<string | null>(null);
  // L12: oversized outlines (the blog log's ~198 dated entries) fold their
  // top-level groups; ordinary article outlines render exactly as before.
  const fold = () => tocEntryCount(tree) > TOC_FOLD_THRESHOLD;
  const [expandedMap, setExpandedMap] = createSignal<Record<string, boolean>>(
    {},
  );
  const toggleFold = (slug: string): void => {
    setExpandedMap(prev => ({ ...prev, [slug]: prev[slug] !== true }));
  };
  // Reveal keeps the highlighted row inside the rail's viewport: on a long
  // outline (the blog log's ~198 entries) the spy highlight would otherwise
  // chase off-screen. 'nearest' moves the rail only when the row is actually
  // clipped, so manual rail scrolling never fights the spy. Scrolling is
  // instant on purpose: an animated rail lags behind continuous article
  // scrolling and lets the highlight ride out of view, while steady-state
  // corrections are one row tall and read as tracking. Safe against the
  // document scroller because #ap-toc is fixed and viewport-spanning — the
  // row is inside the rail's box once revealed, so 'nearest' adjusts the
  // page by zero. Inline placements never reach this (they pass rail=false).
  let listEl: HTMLUListElement | undefined;
  let revealToken = 0;
  let lastExpandAt = -Infinity;
  const revealActive = (slug: string, grew: boolean): void => {
    const container = listEl?.closest<HTMLElement>('#ap-toc');
    const link = listEl?.querySelector<HTMLAnchorElement>(
      `a[href="${CSS.escape(`#${slug}`)}"]`,
    );
    if (!container || !link || container.clientHeight === 0) return;
    const token = ++revealToken;
    const reveal = (): void => {
      link.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    };
    // While a fresh expansion's grid transition runs, row positions read
    // short — measuring mid-flight would only buy a wasted partial hop. So
    // an animating change re-aims on the group's transitionend (exact), with
    // the deadline below as the fallback for a transition that never
    // completes (reduced motion runs none at all and falls through to the
    // immediate pass, where layout is already final).
    // releaseListener runs from whichever path finishes first (the exact
    // event or a deadline/immediate pass) so the listener can never strand
    // on the group when no matching transitionend ever fires.
    let releaseListener: (() => void) | undefined;
    if (grew) {
      const group =
        link.closest('ul.ap-toc-group') ??
        link.closest('li')?.querySelector('ul.ap-toc-group');
      const onSettle = (e: Event): void => {
        // lib.dom types the callback event as plain Event; only grid
        // transitions concern the group (hover color/transform transitions
        // on rows bubble through it).
        if ((e as TransitionEvent).propertyName !== 'grid-template-rows') {
          return;
        }
        releaseListener?.();
        if (token === revealToken) reveal();
      };
      group?.addEventListener('transitionend', onSettle);
      releaseListener = () =>
        group?.removeEventListener('transitionend', onSettle);
    }
    const settleDeadline = (): void => {
      const wait = lastExpandAt + FOLD_SETTLE_MS - performance.now();
      if (wait > 0) {
        setTimeout(() => {
          releaseListener?.();
          if (token === revealToken) reveal();
        }, wait);
      }
    };
    if (grew && !prefersReducedMotion()) {
      settleDeadline();
      return;
    }
    // One macrotask out: Solid flushes the just-applied expansion in a
    // microtask, so the measurement sees post-expansion layout.
    setTimeout(() => {
      releaseListener?.();
      if (token !== revealToken) return;
      reveal();
      settleDeadline();
    }, 0);
  };
  onCleanup(() => {
    revealToken += 1; // strand timers scheduled by the disposed page's rail
  });
  // Scroll spy may highlight an entry inside a folded group (initial hash
  // deep link, plain scrolling). Expansion is monotonic — spy changes never
  // re-collapse a group the reader may be reading.
  createEffect(
    () => active(),
    slug => {
      if (slug === null) return;
      const owner = tocDescendsFrom(tree, slug);
      let grew = false;
      if (owner && expandedMap()[owner.heading.slug] !== true) {
        grew = true;
        lastExpandAt = performance.now();
        setExpandedMap(prev => ({ ...prev, [owner.heading.slug]: true }));
      }
      if (props.rail) revealActive(slug, grew);
    },
  );
  // The spy observes the page's heading elements; the gate hides the body
  // (heading elements removed from the DOM) until unlock, and PasswordGate
  // rebuilds fresh heading nodes on unlock, so gateUnlocked joins the deps
  // to rebind the observer to the new elements. slugs is fixed per mount —
  // a new page's outline arrives via the full remount in remountPageChrome,
  // not through this effect.
  createEffect(
    () => [slugs, gateUnlocked()],
    () => {
      // A new page (or a gate unlock) starts with a clean slate; the
      // observer below re-highlights whatever is in view.
      setActive(null);
      if (slugs.length === 0 || typeof IntersectionObserver === 'undefined')
        return;
      const visible = new Set<string>();
      const io = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target.id);
            else visible.delete(entry.target.id);
          }
          // Highlight the first visible heading in document order — the one
          // closest to the reader's eye line, so the spy points at the
          // section under the viewport top. (A band anchored to the 20vh
          // scroll offset led by several entries on pages with compact
          // sections, like a blog log.)
          const first = slugs.find(slug => visible.has(slug));
          if (first !== undefined) setActive(first);
        },
        // Top edge sits just below the fixed navbar (3.5rem + 8px); the
        // bottom edge only decides eligibility since selection takes the
        // topmost, so 35% simply keeps the band past the next heading.
        // Anchor targets rest at 20vh scroll-margin-top, inside the band,
        // so a jumped-to heading stays the highlighted one.
        { rootMargin: '-64px 0px -65% 0px', threshold: 0 },
      );
      for (const slug of slugs) {
        const el = document.getElementById(slug);
        if (el) io.observe(el);
      }
      return () => io.disconnect();
    },
  );

  const navigate = (slug: string, e: MouseEvent): void => {
    e.preventDefault(); // JS-driven: smooth scroll + history-managed hash
    const el = document.getElementById(slug);
    if (!el) return;
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
    // Keep the URL hash in sync for deep links (vuepress parity); pushState
    // so back/forward revisits previous positions like native anchor jumps.
    history.pushState(null, '', `#${slug}`);
    // pushState fires no hashchange, so flash the target here; the tint
    // holds until the user scrolls on their own.
    flashAnchorTarget(`#${slug}`);
    setActive(slug);
  };

  return (
    // Track line is rail-only (Toc.css .ap-toc nav > ul).
    <ul ref={listEl}>
      <For each={tree}>
        {node => (
          <TocEntry
            node={node}
            depth={0}
            active={active}
            onNavigate={navigate}
            msg={props.msg}
            fold={
              fold()
                ? {
                    expanded: () => expandedMap()[node.heading.slug] === true,
                    toggle: () => toggleFold(node.heading.slug),
                  }
                : undefined
            }
          />
        )}
      </For>
    </ul>
  );
}

/** Fixed rail chunk mounted into #ap-toc (xl viewports and up). */
export function Toc(props: { payload: PagePayload }): SolidElement {
  const t = useMessages(() => props.payload.site);
  // Toc remounts per client-side navigation (remountPageChrome disposes this
  // root and mounts ThemeToc with the new payload), so the payload prop is
  // fixed for the component's lifetime: build the outline once per mount.
  // Plain consts keep the single build — the template reads tree per row.
  const tree = buildTocTree(props.payload.page.headings);
  const visible = useTocVisible(tree, props.payload);
  return (
    <Show when={visible()}>
      <nav aria-label={t.toc.title}>
        <p class="mb-2 px-3 text-sm font-semibold text-[var(--c-text)]">
          {t.toc.title}
        </p>
        <TocOutline tree={tree} msg={t} rail />
      </nav>
    </Show>
  );
}
