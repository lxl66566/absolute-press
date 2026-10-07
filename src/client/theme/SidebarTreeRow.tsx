import { For, Show } from 'solid-js';
import type { Accessor, Element as SolidElement } from 'solid-js';

import type { SidebarItem } from '../../shared/types';
import { cx } from './cx';
import { FaIcon } from './FaIcon';
import type { Messages } from './i18n';
import { ChevronDownIcon } from './icons';
import { isActiveRoute, isExternalHref, withBase } from './links';
import { groupKey, isGroupLinkActive } from './sidebar-tree';
import type { SidebarGroup } from './sidebar-tree';
import { clientBase, clientRoute } from './state';

/**
 * One sidebar/drawer tree row, shared by the desktop rail (SideBar) and the
 * mobile drawer (Root's MobileDrawer). The two used to duplicate the row
 * anatomy (folder row = `ap-sidebar-row` + link/heading + chevron button),
 * the `groupKey` scheme and the indent formula; the surfaces express their
 * differences through props:
 *
 * - link click hook: the drawer closes itself on navigation (`onNavigate`),
 *   the rail lets the browser navigate as usual;
 * - active look: the rail keys it off aria-current in sidebar.css, the
 *   drawer adds an extra pill class (`activeLinkClass`);
 * - heading affordance: drawer heading rows toggle on row click
 *   (`headingToggles`), the rail toggles through the chevron only;
 * - collapse state: one polarity for both surfaces (`collapsed`: member =
 *   collapsed key), each surface owns its own set and persistence.
 */
export interface SidebarTreeProps {
  items: SidebarItem[];
  depth?: number;
  parentKey?: string;
  /** Keys currently collapsed (member = collapsed). */
  collapsed: Accessor<ReadonlySet<string>>;
  toggle: (key: string) => void;
  /** Link click hook (drawer: closeDrawer). */
  onNavigate?: () => void;
  /** Heading rows toggle on row click (drawer affordance). */
  headingToggles?: boolean;
  /** Extra classes for the active leaf link (drawer pill highlight). */
  activeLinkClass?: string;
  msg: Messages;
  icons?: Record<string, string>;
}

/** Row indent at `depth`: one formula, rail and drawer stay aligned. */
const rowIndent = (depth: number): string => `${0.75 + depth * 0.9}rem`;

// No `block` here: paired with `flex` below it would fight for `display`
// (UnoCSS emits `.block` after `.flex`), killing flex gap and centering.
const leafLinkClass =
  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-[var(--c-text-2)] transition duration-150 ease-out hover:bg-[var(--c-bg-soft)] hover:text-[var(--c-text)]';

interface RowPropsBase {
  depth: number;
}

type LeafProps = SidebarTreeProps &
  RowPropsBase & { item: Extract<SidebarItem, { kind: 'link' }> };

type GroupProps = SidebarTreeProps & RowPropsBase & { item: SidebarGroup };

/** Leaf row of the tree. */
function LeafRow(props: LeafProps): SolidElement {
  const active = () => isActiveRoute(props.item.link, clientRoute());
  return (
    <li>
      <a
        href={
          isExternalHref(props.item.link)
            ? props.item.link
            : withBase(clientBase(), props.item.link)
        }
        class={cx(leafLinkClass, active() && props.activeLinkClass)}
        style={{ 'padding-left': rowIndent(props.depth) }}
        aria-current={active() ? 'page' : undefined}
        onClick={props.onNavigate}
      >
        <Show when={props.item.icon}>
          {icon => <FaIcon name={icon()} icons={props.icons} />}
        </Show>
        {props.item.text}
      </a>
    </li>
  );
}

/**
 * Folder row: the link area navigates to the folder index; the chevron is a
 * separate sibling button owning collapse (whole subtree).
 */
function GroupRow(props: GroupProps): SolidElement {
  const key = groupKey(props.item, props.parentKey);
  const collapsible = props.item.collapsible !== false;
  const open = () => !collapsible || !props.collapsed().has(key);
  return (
    <li>
      <div
        class="ap-sidebar-row"
        style={{ 'padding-left': rowIndent(props.depth) }}
        onClick={
          props.headingToggles && !props.item.link
            ? () => props.toggle(key)
            : undefined
        }
      >
        <Show
          when={props.item.link}
          fallback={
            <span
              class={cx(
                'ap-sidebar-row__heading',
                props.headingToggles && 'cursor-pointer',
              )}
            >
              {props.item.text}
            </span>
          }
        >
          {link => (
            <a
              href={
                isExternalHref(link()) ? link() : withBase(clientBase(), link())
              }
              class={cx(
                'ap-sidebar-row__link',
                isGroupLinkActive(props.item, clientRoute()) &&
                  'ap-sidebar-row__link--active',
              )}
              aria-current={
                isGroupLinkActive(props.item, clientRoute())
                  ? 'page'
                  : undefined
              }
              onClick={props.onNavigate}
            >
              <Show when={props.item.icon}>
                {icon => <FaIcon name={icon()} icons={props.icons} />}
              </Show>
              <span class="ap-sidebar-row__text">{props.item.text}</span>
            </a>
          )}
        </Show>
        <Show when={collapsible}>
          <button
            type="button"
            class="ap-sidebar-row__chevron"
            aria-expanded={open() ? 'true' : 'false'}
            aria-label={
              open()
                ? props.msg.sidebar.collapseGroup
                : props.msg.sidebar.expandGroup
            }
            onClick={() => props.toggle(key)}
          >
            <ChevronDownIcon
              class={cx(
                'size-4 transition-transform duration-150 ease-out',
                !open() && '-rotate-90',
              )}
            />
          </button>
        </Show>
      </div>
      <ul class={cx('ap-collapse ap-sidebar-group', !open() && 'ap-collapsed')}>
        <SidebarTree
          items={props.item.children}
          depth={props.depth + 1}
          parentKey={key}
          collapsed={props.collapsed}
          toggle={props.toggle}
          onNavigate={props.onNavigate}
          headingToggles={props.headingToggles}
          activeLinkClass={props.activeLinkClass}
          msg={props.msg}
          icons={props.icons}
        />
      </ul>
    </li>
  );
}

/** Recursive tree renderer (rows carry the `ap-sidebar-row` contract). */
export function SidebarTree(props: SidebarTreeProps): SolidElement {
  // depth/parentKey come from literals at every call site — static values.
  const depth = props.depth ?? 0;
  const parentKey = props.parentKey ?? '';
  return (
    <For each={props.items}>
      {item =>
        item.kind === 'link' ? (
          <LeafRow {...props} item={item} depth={depth} parentKey={parentKey} />
        ) : (
          <GroupRow
            {...props}
            item={item}
            depth={depth}
            parentKey={parentKey}
          />
        )
      }
    </For>
  );
}
