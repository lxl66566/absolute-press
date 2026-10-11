import type { Element as SolidElement } from 'solid-js';

import { cx } from '../theme/cx';

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
