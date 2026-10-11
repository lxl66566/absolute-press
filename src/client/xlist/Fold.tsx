import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { cx } from '../theme/cx';

import './Fold.css';

/**
 * Inline fold primitive: content clamped to two lines with a right fade;
 * clicking toggles the full text. The span-based counterpart of the shared
 * `.ap-collapse` block animation, for dense surfaces such as table cells.
 * Foldability (clamped height < full height) is detected once after mount;
 * short content never reads as interactive.
 */
export function Fold(props: { children: JSX.Element }): SolidElement {
  let contentRef: HTMLSpanElement | undefined;
  const [foldable, setFoldable] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const check = (): void => {
    const el = contentRef;
    if (!el || expanded()) return;
    setFoldable(el.scrollHeight > el.clientHeight + 1);
  };
  queueMicrotask(check);
  return (
    <span
      class={cx(
        'ap-fold',
        foldable() && 'is-foldable',
        expanded() && 'is-expanded',
      )}
      onClick={() => {
        if (foldable()) setExpanded(!expanded());
      }}
    >
      <span class="ap-fold__content" ref={contentRef}>
        {props.children}
      </span>
    </span>
  );
}
