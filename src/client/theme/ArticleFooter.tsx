import type { Element as SolidElement } from 'solid-js';

import type { PagePayload } from '../../shared/types';

/**
 * Creative Commons glyph (FA free brands `creative-commons`, CC BY 4.0).
 * Inline like the navbar's BUILTIN_SOCIAL_ICONS (navbar/social-icons.ts):
 * the theme carries no FA dependency, and site `icons` registration stays
 * reserved for content frontmatter.
 */
const CC_GLYPH =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" fill="currentColor"><path d="M245.83 214.87l-33.22 17.28c-9.43-19.58-25.24-19.93-27.46-19.93-22.13 0-33.22 14.61-33.22 43.84 0 23.57 9.21 43.84 33.22 43.84 14.47 0 24.65-7.09 30.57-21.26l30.55 15.5c-6.17 11.51-25.69 38.98-65.1 38.98-22.6 0-73.96-10.32-73.96-77.05 0-58.69 43-77.06 72.63-77.06 30.72-.01 52.7 11.95 65.99 35.86zm143.05 0l-32.78 17.28c-9.5-19.77-25.72-19.93-27.9-19.93-22.14 0-33.22 14.61-33.22 43.84 0 23.55 9.23 43.84 33.22 43.84 14.45 0 24.65-7.09 30.54-21.26l31 15.5c-2.1 3.75-21.39 38.98-65.09 38.98-22.69 0-73.96-9.87-73.96-77.05 0-58.67 42.97-77.06 72.63-77.06 30.71-.01 52.58 11.95 65.56 35.86zM247.56 8.05C104.74 8.05 0 123.11 0 256.05c0 138.49 113.6 248 247.56 248 129.93 0 248.44-100.87 248.44-248 0-137.87-106.62-248-248.44-248zm.87 450.81c-112.54 0-203.7-93.04-203.7-202.81 0-105.42 85.43-203.27 203.72-203.27 112.53 0 202.82 89.46 202.82 203.26-.01 121.69-99.68 202.82-202.84 202.82z"/></svg>';

/** Framework repository the "Powered by" attribution links to. */
const FRAMEWORK_REPO = 'https://github.com/lxl66566/absolute-press';

/**
 * The site credits line — CC glyph + the framework name by default, or the
 * site-configured credit text (payload `site.footerCredit`, config
 * `footer.credit`). Shared by the desktop footer (ArticleFooter) and the
 * mobile drawer footer (Root.tsx).
 */
export function FooterCredits(props: { credit?: string }): SolidElement {
  return props.credit !== undefined && props.credit !== '' ? (
    <span>{props.credit}</span>
  ) : (
    <span class="inline-flex items-center gap-1.5">
      <span
        class="ap-fa-icon inline-flex shrink-0 items-center [&>svg]:block [&>svg]:size-[0.95em]"
        innerHTML={CC_GLYPH}
        aria-hidden="true"
      />
      <span>absolute-press</span>
    </span>
  );
}

/**
 * Desktop footer content: one quiet two-sided line — the site credits on
 * the left, the framework attribution on the right (small text; the
 * footer's height token --ap-footer-h in theme.css centers this row). The
 * footer's visuals (border, compact height) and its content-column sizing
 * live in theme.css (#ap-footer). No prev/next navigation by design — the
 * related-articles component owns that role.
 */
export function ArticleFooter(props: { payload: PagePayload }): SolidElement {
  return (
    <footer class="flex flex-wrap items-center justify-between gap-x-4 text-xs text-[var(--c-text-2)]">
      <FooterCredits credit={props.payload.site.footerCredit} />
      <span>
        Powered by{' '}
        <a
          href={FRAMEWORK_REPO}
          target="_blank"
          rel="noreferrer"
          class="text-[var(--c-accent)] transition-colors duration-150 ease-out hover:underline"
        >
          absolute-press
        </a>
      </span>
    </footer>
  );
}
