import type { JSX } from '@solidjs/web';
import { createSignal, onCleanup } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { cx } from '../theme/cx';

import './Fold.css';

/**
 * Inline fold primitive: content clamped to two lines with a right fade;
 * clicking — or Enter/Space, when foldable — toggles the full text. The
 * span-based counterpart of the shared `.ap-collapse` block animation, for
 * dense surfaces such as table cells. Foldability (clamped height < full
 * height) is re-derived whenever layout can change it: the ResizeObserver
 * reports the box on observe (mount) and on every later resize (column
 * drag, breakpoint), and document.fonts.ready covers late web fonts
 * rewrapping lines. Short content never reads as interactive.
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
  const ro = new ResizeObserver(check);
  document.fonts.ready.then(check);
  onCleanup(() => ro.disconnect());
  return (
    <span
      class={cx(
        'ap-fold',
        foldable() && 'is-foldable',
        expanded() && 'is-expanded',
      )}
      // Only foldable content is interactive: it reads as a button to
      // assistive tech then; non-foldable content stays plain text.
      role={foldable() ? 'button' : undefined}
      tabindex={foldable() ? 0 : undefined}
      aria-expanded={foldable() ? (expanded() ? 'true' : 'false') : undefined}
      onClick={e => {
        if (!foldable()) return;
        // The fold owns its clicks: row-level toggles (XList) must not
        // expand underneath an inline text fold. Non-foldable folds keep
        // bubbling so clicks hit the surrounding row like any plain text.
        e.stopPropagation();
        setExpanded(!expanded());
      }}
      onKeyDown={e => {
        if (!foldable()) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        setExpanded(!expanded());
      }}
    >
      <span
        class="ap-fold__content"
        ref={el => {
          contentRef = el;
          ro.observe(el);
        }}
      >
        {props.children}
      </span>
    </span>
  );
}
