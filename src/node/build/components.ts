/**
 * Build component renderers: pure functions turning markdown tag props plus
 * build-time site data into final static HTML. The markdown layer emits
 * transient markers for these tags (see markdown/islands.ts); site.ts swaps
 * them via this registry after the render, when the locale article list
 * (titles come from rendered h1s) exists. Adding a built-in = one row in
 * shared/components.ts plus one renderer here; the context object only ever
 * gains fields so later components never break earlier signatures.
 */
import { formatDate } from '../../shared/date.ts';
import { messagesForLang } from '../../shared/i18n/index.ts';
import { withBase } from '../../shared/links.ts';
import type { ArticleInfo } from '../../shared/types.ts';
import type { ResolvedConfig } from '../config.ts';
import { escapeHtml } from '../escape.ts';

/**
 * Everything a build component may read. `articles` is scoped to the host
 * page's locale (buildArticles output: locale homes excluded, newest first).
 */
export interface BuildComponentContext {
  config: ResolvedConfig;
  articles: ArticleInfo[];
  /** Per-page relative base prefix ('', '../'). */
  base: string;
  /** Full config icons map (site-trusted svg strings). */
  icons: Record<string, string>;
  /** `<html lang>` of the host page; drives UI copy resolution. */
  lang: string | undefined;
  /** Clean route of the host page. */
  route: string;
  /** Source file of the host page, for error messages. */
  filePath: string;
}

export type BuildComponentRenderer = (
  props: Record<string, unknown>,
  ctx: BuildComponentContext,
) => string;

/** One entry per shared/components.ts registry row. */
export const BUILD_COMPONENT_RENDERERS: Record<string, BuildComponentRenderer> =
  {
    RecentArticles: renderRecentArticles,
  };

const DEFAULT_RECENT_COUNT = 5;

/** Non-negative integer prop with a default; hard-fails on anything else. */
function countProp(
  props: Record<string, unknown>,
  key: string,
  filePath: string,
): number {
  const raw = props[key];
  if (raw === undefined) return DEFAULT_RECENT_COUNT;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    throw new Error(
      `[absolute-press] build component <RecentArticles> prop "${key}" must be a non-negative integer, got ${JSON.stringify(raw)} (in ${filePath})`,
    );
  }
  return raw;
}

/**
 * Config icon value -> standalone svg string: bare inner markup gets the
 * 24x24 currentColor wrapper (same normalization as the client FaIcon; no
 * DOMParser here — config values are site-trusted). Unknown/blank -> ''.
 */
function iconSvg(
  key: string | undefined,
  icons: Record<string, string>,
): string {
  const trimmed = (key === undefined ? undefined : icons[key])?.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('<svg')
    ? trimmed
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${trimmed}</svg>`;
}

/** One column: heading + rows of icon/title link and right-aligned date. */
function recentColumn(
  kind: 'latest' | 'updated',
  articles: ArticleInfo[],
  ctx: BuildComponentContext,
): string {
  const t = messagesForLang(ctx.lang).recent;
  const rows = articles
    .map(article => {
      const raw = kind === 'latest' ? article.createdAt : article.updatedAt;
      const date = formatDate(raw);
      const icon = iconSvg(article.icon, ctx.icons);
      const time =
        raw === null || date === null
          ? ''
          : `<time class="ap-recent__date" datetime="${escapeHtml(raw)}">${date}</time>`;
      return `<li class="ap-recent__item"><a class="ap-recent__link" href="${escapeHtml(withBase(ctx.base, article.route))}">${icon}<span class="ap-recent__name">${escapeHtml(article.title)}</span></a>${time}</li>`;
    })
    .join('');
  return `<div class="ap-recent__col"><h3 class="ap-recent__title">${escapeHtml(kind === 'latest' ? t.latest : t.updated)}</h3><ul class="ap-recent__list">${rows}</ul></div>`;
}

/**
 * `<RecentArticles :latest="5" :updated="5" />`: two article columns rendered
 * as final static HTML. Latest = frontmatter `date`, newest first (the input
 * list is pre-sorted). Recently updated = git last-commit time, newest
 * first, excluding pages without a git time and pages never committed
 * separately (`updatedAt === createdAt` — a fresh article would otherwise
 * dominate both columns). `0` hides a column; both zero renders nothing.
 */
function renderRecentArticles(
  props: Record<string, unknown>,
  ctx: BuildComponentContext,
): string {
  const latestCount = countProp(props, 'latest', ctx.filePath);
  const updatedCount = countProp(props, 'updated', ctx.filePath);
  if (latestCount === 0 && updatedCount === 0) return '';
  if (ctx.articles.length === 0) return '';
  const latest = ctx.articles.slice(0, latestCount);
  const updated =
    updatedCount === 0
      ? []
      : ctx.articles
          .filter(
            a => a.updatedAt !== null && a.updatedAt > (a.createdAt ?? ''),
          )
          .toSorted(
            (a, b) =>
              b.updatedAt!.localeCompare(a.updatedAt!) ||
              a.route.localeCompare(b.route),
          )
          .slice(0, updatedCount);
  // Empty columns are omitted outright: a lone heading over no rows reads
  // as a bug, not as an empty state (sites with no git times yet, etc.).
  const cols =
    (latest.length > 0 ? recentColumn('latest', latest, ctx) : '') +
    (updated.length > 0 ? recentColumn('updated', updated, ctx) : '');
  return cols === '' ? '' : `<section class="ap-recent">${cols}</section>`;
}
