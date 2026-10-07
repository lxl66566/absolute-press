import { createSignal, Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { imageData, openImage } from '../runtime/photoswipe';
import { cx } from '../theme/cx';
import { pageMessages } from '../theme/i18n';
import { flagOn } from './props';

import './ZoomedImg.css';

/**
 * Click-to-zoom image (island name: `ZoomedImg`).
 *
 * Usage in markdown: `<ZoomedImg src="..." alt="..." />`. A relative `src`
 * (./ ../) is resolved by the build layer through the same asset pipeline as
 * regular markdown images; absolute (/...) and remote URLs pass through.
 *
 * Extras for migrated content:
 * - `scale`: container width as a percentage string ("60%"), number 0-1
 *   (0.6 -> 60%) or plain number treated as a percentage ("80" -> 80%).
 * - `mask`: blur the image behind a "click to view" veil until clicked
 *   (one-way reveal, like the legacy vue component it replaces).
 *
 * Zooming shares the global photoswipe lightbox.
 */
export interface ZoomedImgProps {
  childrenHtml?: string;
  src?: string;
  alt?: string;
  title?: string;
  scale?: string | number;
  mask?: boolean | string;
}

/** Normalize the `scale` prop to a CSS width string; null when invalid. */
export function scaleToWidth(
  scale: string | number | undefined,
): string | null {
  if (scale === undefined) return null;
  if (typeof scale === 'number') {
    return `${scale > 0 && scale <= 1 ? scale * 100 : scale}%`;
  }
  const text = scale.trim();
  if (text === '') return null;
  if (text.endsWith('%')) return text;
  const num = Number.parseFloat(text);
  if (Number.isNaN(num)) return null;
  return `${num > 0 && num <= 1 ? num * 100 : num}%`;
}

export function ZoomedImg(props: ZoomedImgProps): SolidElement {
  let imgRef: HTMLImageElement | undefined;
  // Islands carry no locale prop: derive messages from the page language.
  const t = pageMessages();
  // Masked images start obscured and reveal once; toggling back off is not
  // supported (matches the legacy one-way reveal).
  const [revealed, setRevealed] = createSignal(!flagOn(props.mask));
  const width = scaleToWidth(props.scale);
  const zoom = (): void => {
    if (imgRef && revealed()) void openImage(imageData(imgRef));
  };
  return (
    <figure class="ap-zoomed" style={width ? { width } : undefined}>
      <div
        class={cx('ap-zoomed__wrapper', !revealed() && 'is-masked')}
        onClick={() => (revealed() ? zoom() : setRevealed(true))}
      >
        <img
          ref={imgRef}
          src={props.src}
          alt={props.alt ?? ''}
          title={props.title}
          loading="lazy"
          class="max-w-full cursor-zoom-in rounded-lg"
        />
        <Show when={!revealed()}>
          <span class="ap-zoomed__veil" aria-hidden="true">
            <span class="ap-zoomed__veil-text">{t.zoomedImg.clickToView}</span>
          </span>
        </Show>
      </div>
      <Show when={props.alt}>
        <figcaption>{props.alt}</figcaption>
      </Show>
    </figure>
  );
}
