import { Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { cx } from '../theme/cx';
import { ariaSortValue } from './sort';

/**
 * Header sort button (legacy SortIndicator port): label + stacked triangles,
 * the active one accent-lit. Shared by XList and the ExpandableList island.
 * Color transitions only — icons never animate.
 */
export function Sorter(props: {
  label: string;
  hint: string;
  dir: 'asc' | 'desc' | 'none';
  onToggle: () => void;
}): SolidElement {
  return (
    <button
      type="button"
      class="ap-xlist__sorter"
      onClick={props.onToggle}
      title={props.hint}
    >
      <span class="ap-xlist__sorter-label">{props.label}</span>
      <span class="ap-xlist__sorter-icons" aria-hidden="true">
        <span
          class={cx(
            'ap-xlist__sorter-tri is-up',
            props.dir === 'asc' && 'is-active',
          )}
        />
        <span
          class={cx(
            'ap-xlist__sorter-tri is-down',
            props.dir === 'desc' && 'is-active',
          )}
        />
      </span>
    </button>
  );
}

/**
 * One table header cell: plain label, or the Sorter button with `aria-sort`
 * on the cell, when the column is sortable. Shared thead wiring of XList and
 * the ExpandableList island.
 */
export function SortHeader(props: {
  label: string;
  sortable: boolean;
  dir: 'asc' | 'desc' | 'none';
  hint: string;
  onToggle: () => void;
  /** Title-column modifier (ap-xlist__th--title). */
  title?: boolean;
}): SolidElement {
  return (
    <th
      class={cx('ap-xlist__th', props.title && 'ap-xlist__th--title')}
      scope="col"
      aria-sort={props.sortable ? ariaSortValue(props.dir) : undefined}
    >
      <Show when={props.sortable} fallback={props.label}>
        <Sorter
          label={props.label}
          hint={props.hint}
          dir={props.dir}
          onToggle={props.onToggle}
        />
      </Show>
    </th>
  );
}
