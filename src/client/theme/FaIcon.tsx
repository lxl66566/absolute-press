import { Show } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

import { cx } from './cx';

/**
 * Normalize a config-registered icon value to a standalone svg string.
 * Values are either a complete `<svg>...</svg>` string or bare inner markup
 * (e.g. `<path .../>`), which is wrapped in a 24x24 currentColor svg.
 *
 * The map is the site's own config (trusted); values are still XML-parsed so
 * malformed markup degrades to "no icon" instead of breaking surrounding DOM.
 * The same raw string parses on every render of every row, so results are
 * cached by raw input.
 */
const svgCache = new Map<string, string | null>();

function normalizeSvg(raw: string): string | null {
  const cached = svgCache.get(raw);
  if (cached !== undefined) return cached;
  const trimmed = raw.trim();
  let result: string | null = null;
  if (trimmed !== '') {
    const markup = trimmed.startsWith('<svg')
      ? trimmed
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${trimmed}</svg>`;
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    result = doc.querySelector('parsererror')
      ? null
      : doc.documentElement.outerHTML;
  }
  svgCache.set(raw, result);
  return result;
}

/**
 * Inline SVG for a site-registered icon key (payload `site.icons`, a subset
 * of config `icons`). Unknown keys render nothing — the build layer already
 * errors on unregistered frontmatter icons.
 */
export function FaIcon(props: {
  name: string;
  icons?: Record<string, string>;
  class?: string;
}): SolidElement {
  const svg = () => {
    const raw = props.icons?.[props.name];
    return raw === undefined ? null : normalizeSvg(raw);
  };
  return (
    <Show when={svg()}>
      {markup => (
        <span
          class={cx(
            // `ap-fa-icon` is a plain style hook: feature stylesheets
            // (sidebar.css) upsize/align glyphs per surface without touching
            // this component's rendering contract.
            'ap-fa-icon inline-flex shrink-0 items-center [&>svg]:block [&>svg]:size-[0.95em]',
            // Optical (not geometric) centering: FA solid glyphs fill the
            // full em box with bottom-heavy ink, so they read as sinking
            // below the text line. Lift the glyph a touch and keep it a
            // hair under 1em so its ink mass sits on the text's optical
            // centerline. em units scale with every font size.
            '[&>svg]:translate-y-[-0.06em]',
            props.class,
          )}
          aria-hidden="true"
          innerHTML={markup()}
        />
      )}
    </Show>
  );
}
