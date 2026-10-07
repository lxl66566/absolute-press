import { container } from '@mdit/plugin-container';
import type { MarkdownIt } from 'markdown-it';

import { inlineTitleEnv } from './env.ts';

const TITLED_TYPES = [
  'tip',
  'warning',
  'danger',
  'caution',
  'error',
  'info',
] as const;

type TitledType = (typeof TITLED_TYPES)[number];

/**
 * Default titles are Chinese (the framework's zh-first posture, old-site
 * parity); English sites override via renderer `containerTitles`.
 */
const DEFAULT_TITLES: Record<TitledType | 'details', string> = {
  tip: '提示',
  warning: '警告',
  danger: '特别注意',
  caution: '注意',
  error: '错误',
  info: '信息',
  details: '详情',
};

/**
 * Inline stroke icon per container type (lucide-style paths, currentColor).
 * The svg wrapper is emitted once in `titleMarkup`; icons are static, no
 * animation (site UX rule: icons never animate).
 */
const TYPE_ICONS: Record<TitledType | 'details', string> = {
  tip: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>',
  warning:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  caution:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  danger:
    '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  error:
    '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  details: '<path d="m9 18 6-6-6-6"/>',
};

/** Title line: icon + label, one inline svg per container. */
function titleMarkup(type: TitledType | 'details', title: string): string {
  return (
    `<svg class="ap-container__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TYPE_ICONS[type]}</svg>` +
    title
  );
}

/**
 * `:::` containers. DOM classes follow the cross-agent contract:
 * `ap-container ap-container--<type>` + `ap-container__title`.
 * `::::` nesting works via longer marker runs.
 */
export function registerContainers(
  md: MarkdownIt,
  titles: Record<string, string>,
): void {
  for (const type of TITLED_TYPES) {
    md.use(container, {
      name: type,
      openRenderer: (tokens, idx, _options, env) => {
        const token = tokens[idx];
        if (!token) return '';
        const title = md.renderInline(
          containerTitle(token.info, type, titles),
          inlineTitleEnv(env),
        );
        return `<div class="ap-container ap-container--${type}"><p class="ap-container__title">${titleMarkup(type, title)}</p>\n`;
      },
      closeRenderer: () => '</div>\n',
    });
  }
  md.use(container, {
    name: 'details',
    openRenderer: (tokens, idx, _options, env) => {
      const token = tokens[idx];
      if (!token) return '';
      const title = md.renderInline(
        containerTitle(token.info, 'details', titles),
        inlineTitleEnv(env),
      );
      return `<details class="ap-container ap-container--details"><summary class="ap-container__title">${titleMarkup('details', title)}</summary>\n`;
    },
    closeRenderer: () => '</details>\n',
  });
  md.use(container, {
    name: 'right',
    openRenderer: () => '<div class="ap-container ap-container--right">\n',
    closeRenderer: () => '</div>\n',
  });
}

/** Custom title after the type keyword, else configured/default label. */
function containerTitle(
  info: string,
  type: TitledType | 'details',
  titles: Record<string, string>,
): string {
  const custom = info.trim().slice(type.length).trim();
  if (custom) return custom;
  return titles[type] ?? DEFAULT_TITLES[type];
}
