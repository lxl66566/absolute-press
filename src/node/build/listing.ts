/**
 * Built-in listing pages (config `pages`): the timeline, the category
 * overview and the tag overview. Synthetic like the archive pages — one
 * static page per locale outside the content tree, never in navbar/sidebar
 * — but rendered fully static (no payload article list, no client JS), so
 * crawlers and no-JS clients read the whole listing.
 */
import { messagesForLang } from '../../shared/i18n/index.ts';
import { withBase } from '../../shared/links.ts';
import type {
  ArticleInfo,
  DirectoryIndex,
  LocaleInfo,
  ProfileChip,
} from '../../shared/types.ts';
import type { ResolvedConfig } from '../config.ts';
import { escapeHtml } from '../escape.ts';

export type ListingKind = 'timeline' | 'categories' | 'tags';

const LISTING_KINDS: readonly ListingKind[] = [
  'timeline',
  'categories',
  'tags',
];

/** One synthetic listing page: `/timeline/`, `/categories/`, `/tags/`. */
export interface ListingPage {
  route: string;
  title: string;
  locale: LocaleInfo;
  kind: ListingKind;
}

/**
 * Canonical route of one listing page in a locale, in the configured
 * directory-index shape ('/timeline/' slash mode, '/timeline' bare mode).
 * The file is always `timeline/index.html` (routeToFileName with index).
 */
export function listingRouteOf(
  prefix: string,
  kind: ListingKind,
  directoryIndex: DirectoryIndex,
): string {
  const base = `${prefix}/${kind}`;
  return directoryIndex === 'slash' ? `${base}/` : base;
}

/** Enabled listing pages of every locale, config locale order, fixed kind order. */
export function listingPages(config: ResolvedConfig): ListingPage[] {
  const out: ListingPage[] = [];
  for (const locale of config.locales) {
    for (const kind of LISTING_KINDS) {
      if (!config.pages[kind]) continue;
      out.push({
        route: listingRouteOf(locale.prefix, kind, config.urls.directoryIndex),
        title: messagesForLang(locale.lang).listing[kind],
        locale,
        kind,
      });
    }
  }
  return out;
}

/** Routes of the enabled listing pages of one locale (payload `site.pages`). */
export function listingRoutesOf(
  config: ResolvedConfig,
  locale: LocaleInfo,
): { timeline?: string; categories?: string; tags?: string } | undefined {
  const routes: { timeline?: string; categories?: string; tags?: string } = {};
  for (const kind of LISTING_KINDS) {
    if (config.pages[kind]) {
      routes[kind] = listingRouteOf(
        locale.prefix,
        kind,
        config.urls.directoryIndex,
      );
    }
  }
  return Object.keys(routes).length > 0 ? routes : undefined;
}

/** Adjacent year group of the date-sorted timeline (null = undated, last). */
interface YearGroup {
  year: string | null;
  articles: ArticleInfo[];
}

/** Fold the date-sorted list into adjacent year groups (null year last). */
function groupByYear(articles: ArticleInfo[]): YearGroup[] {
  const groups: YearGroup[] = [];
  for (const a of articles) {
    const year = a.createdAt === null ? null : a.createdAt.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.articles.push(a);
    else groups.push({ year, articles: [a] });
  }
  return groups;
}

/** Timeline body: year-grouped `date · title` rows of the sorted list. */
function timelineHtml(
  articles: ArticleInfo[],
  base: string,
  lang: string | undefined,
): string {
  if (articles.length === 0) return '';
  const t = messagesForLang(lang).listing;
  const groups = groupByYear(articles)
    .map(group => {
      const label =
        group.year === null
          ? t.undated
          : escapeHtml(group.year, { attr: false });
      const rows = group.articles
        .map(a => {
          const date = a.createdAt?.slice(0, 10) ?? null;
          return (
            '<li><a class="ap-timeline__link" href="' +
            escapeHtml(withBase(base, a.route)) +
            '">' +
            (date
              ? `<time class="ap-timeline__date" datetime="${date}">${date}</time>`
              : '<span class="ap-timeline__date">—</span>') +
            `<span class="ap-timeline__title">${escapeHtml(a.title, { attr: false })}</span>` +
            '</a></li>'
          );
        })
        .join('');
      return (
        '<section class="ap-timeline__group">' +
        `<h2 class="ap-timeline__year">${label}<span class="ap-timeline__count">${group.articles.length}</span></h2>` +
        `<ul class="ap-timeline__list">${rows}</ul>` +
        '</section>'
      );
    })
    .join('');
  return `<div class="ap-timeline">${groups}</div>`;
}

/** Category/tag overview body: chip cloud linking the archive pages. */
function termsHtml(
  chips: ProfileChip[],
  base: string,
  emptyText: string,
): string {
  if (chips.length === 0) {
    return `<p class="ap-listing-empty">${escapeHtml(emptyText)}</p>`;
  }
  const items = chips
    .map(
      chip =>
        '<li><a class="ap-terms__chip" href="' +
        escapeHtml(withBase(base, chip.route)) +
        '" title="' +
        escapeHtml(`${chip.name}（${chip.count}）`) +
        `"><span class="ap-terms__name">${escapeHtml(chip.name, { attr: false })}</span><span class="ap-terms__count">${chip.count}</span></a></li>`,
    )
    .join('');
  return `<ul class="ap-terms">${items}</ul>`;
}

/** Per-kind data the listing renderer needs (all derived from one locale's chrome). */
export interface ListingData {
  /** `profile.exclude`-filtered article list (timeline rows). */
  articles: ArticleInfo[];
  categoryChips: ProfileChip[];
  tagChips: ProfileChip[];
}

/**
 * Full content of one listing page: the localized h1 plus the static body.
 * The empty timeline/terms fall back to the shared "no articles" copy.
 */
export function renderListingContent(
  listing: ListingPage,
  data: ListingData,
  base: string,
): string {
  const lang = listing.locale.lang;
  const t = messagesForLang(lang);
  const body =
    listing.kind === 'timeline'
      ? timelineHtml(data.articles, base, lang)
      : termsHtml(
          listing.kind === 'categories' ? data.categoryChips : data.tagChips,
          base,
          t.feed.empty,
        );
  const empty =
    body === ''
      ? `<p class="ap-listing-empty">${escapeHtml(t.feed.empty)}</p>`
      : '';
  return `<h1>${escapeHtml(listing.title, { attr: false })}</h1>${body}${empty}`;
}
