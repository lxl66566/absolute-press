import type { Element as SolidElement } from 'solid-js';

import { cx } from '../theme/cx';

/**
 * Full-width reveal row under one item row, shared by XList and the
 * ExpandableList island. Uses the shared .ap-collapse mechanics (theme.css),
 * inverted: the reveal starts collapsed and drops ap-collapsed to open.
 * Rendered for EVERY item (empty bodies included): the tbody must keep
 * strict item/reveal interleaving or the 4n+1 zebra stripe loses its rhythm.
 */
export function RevealRow(props: {
  id: string;
  open: boolean;
  colspan: number;
  html: string;
}): SolidElement {
  return (
    <tr class={cx('ap-xlist__reveal-row', props.open && 'is-open')}>
      <td class="ap-xlist__reveal-cell" colspan={props.colspan}>
        {/* Inner wrapper carries padding: a 0fr grid row cannot compress it,
            and on `.ap-xlist__body` it used to leak a sliver under collapsed
            rows. */}
        <div
          class={cx(
            'ap-xlist__reveal ap-collapse',
            !props.open && 'ap-collapsed',
          )}
          id={props.id}
        >
          <div class="ap-xlist__body">
            <div class="ap-xlist__body-inner" innerHTML={props.html} />
          </div>
        </div>
      </td>
    </tr>
  );
}
