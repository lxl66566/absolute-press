/**
 * Build-time author profile: per-locale taxonomy derivation (shared by the
 * static home card, the drawer's payload stats and the built-in listing
 * pages) and the static card HTML. Like the RecentArticles build component,
 * the card is final static HTML — crawlers and no-JS clients see it without
 * hydration.
 */
import { BUILTIN_SOCIAL_ICONS } from '../../shared/brand-icons.ts';
import { messagesForLang } from '../../shared/i18n/index.ts';
import { isExternalHref, withBase } from '../../shared/links.ts';
import type {
  LocaleInfo,
  ProfileChip,
  ProfileTaxonomy,
  SiteProfile,
  SocialEntry,
} from '../../shared/types.ts';
import type { ArticleInfo } from '../../shared/types.ts';
import type { ResolvedProfile } from '../config.ts';
import { escapeHtml } from '../escape.ts';
import { iconSvg } from '../icon-svg.ts';
import { groupArchiveArticles } from './archive.ts';
import { isNavExcluded } from './pages.ts';

/** Anchor ids of the card's chip groups (stats row jump targets). */
const CATS_ANCHOR = 'ap-home-profile-cats';
const TAGS_ANCHOR = 'ap-home-profile-tags';

/**
 * The article list every profile-taxonomy consumer derives from: the
 * locale's article list (buildArticles output — locale homes already
 * excluded) minus the `profile.exclude` routes. Undefined profile config
 * keeps the list intact. The timeline page shares this set, so the
 * profile card's article count always equals the timeline's row count.
 */
export function profileKeptArticles(
  profile: ResolvedProfile | undefined,
  articles: ArticleInfo[],
): ArticleInfo[] {
  return profile
    ? articles.filter(a => !isNavExcluded(a.route, profile.exclude))
    : articles;
}

/**
 * Chip lists of one locale, grouped exactly like the archive pages (case
 * merging, lowercase order), so chip counts always agree with the archives.
 */
export function buildTaxonomy(
  articles: ArticleInfo[],
  locale: LocaleInfo,
): { categoryChips: ProfileChip[]; tagChips: ProfileChip[] } {
  const chips = (kind: 'category' | 'tag'): ProfileChip[] =>
    groupArchiveArticles(articles, kind).map(group => ({
      name: group.name,
      count: group.articles.length,
      route: `${locale.prefix}/${kind}/${encodeURIComponent(group.name)}`,
    }));
  return { categoryChips: chips('category'), tagChips: chips('tag') };
}

/** Profile data of one locale (see profileKeptArticles / buildTaxonomy). */
export function buildSiteProfile(
  profile: ResolvedProfile,
  articles: ArticleInfo[],
  locale: LocaleInfo,
): SiteProfile {
  const kept = profileKeptArticles(profile, articles);
  return {
    articles: kept.length,
    ...buildTaxonomy(kept, locale),
    name: profile.name,
    ...(profile.avatar ? { avatar: profile.avatar } : {}),
    ...(profile.link ? { link: profile.link } : {}),
    ...(profile.articlesLink ? { articlesLink: profile.articlesLink } : {}),
  };
}

/** Payload view of the profile data: plain counts, no chips, no identity. */
export function drawerStatsOf(data: SiteProfile): ProfileTaxonomy {
  return {
    articles: data.articles,
    categories: data.categoryChips.length,
    tags: data.tagChips.length,
  };
}

/** href of a link field: routes take the page base, external hrefs pass through. */
function linkHref(base: string, href: string): string {
  return isExternalHref(href) ? href : withBase(base, href);
}

/** `inner` as a plain div, or as a link when `href` is given. */
function wrapLink(
  href: string | undefined,
  inner: string,
  cls: string,
): string {
  return href === undefined
    ? `<div class="${cls}">${inner}</div>`
    : `<a class="${cls}" href="${escapeHtml(href)}">${inner}</a>`;
}

/** One stat entry: number over label; an `href` makes it a link. */
function statHtml(
  value: number,
  label: string,
  href: string | undefined,
): string {
  const inner = `<b>${value}</b><span>${escapeHtml(label)}</span>`;
  return href === undefined
    ? `<div class="ap-home-profile__stat">${inner}</div>`
    : `<a class="ap-home-profile__stat" href="${escapeHtml(href)}">${inner}</a>`;
}

/** One chip group: label + wrapped chips; categories carry count badges. */
function groupHtml(
  kind: 'category' | 'tag',
  entries: ProfileChip[],
  label: string,
  base: string,
): string {
  const chips = entries
    .map(entry => {
      const count =
        kind === 'category'
          ? `<span class="ap-home-profile__chip-count">${entry.count}</span>`
          : '';
      return `<li><a class="ap-home-profile__chip${
        kind === 'tag' ? ' ap-home-profile__chip--tag' : ''
      }" href="${escapeHtml(linkHref(base, entry.route))}" title="${escapeHtml(
        `${entry.name}（${entry.count}）`,
      )}">${escapeHtml(entry.name, { attr: false })}${count}</a></li>`;
    })
    .join('');
  return `<section class="ap-home-profile__group" id="${
    kind === 'category' ? CATS_ANCHOR : TAGS_ANCHOR
  }"><span class="ap-home-profile__label">${escapeHtml(
    label,
  )}</span><ul class="ap-home-profile__chips">${chips}</ul></section>`;
}

/** Everything the static card renders with. */
export interface ProfileCardContext {
  /** Per-page relative base prefix ('' on the locale home itself). */
  base: string;
  /** `<html lang>` of the host page; drives UI copy resolution. */
  lang: string | undefined;
  /** Config `nav.social` entries, rendered as the card's icon row. */
  social: SocialEntry[];
  /** Full config icons map (site-trusted svg strings). */
  icons: Record<string, string>;
  /**
   * Built-in listing page routes of this locale (config `pages`): the
   * default stat-link targets. A disabled page falls back — categories and
   * tags anchor to the card's own chip groups, the article count renders
   * as plain text unless `profile.articlesLink` is set.
   */
  pages?: {
    timeline?: string;
    categories?: string;
    tags?: string;
  };
}

/**
 * The static profile card, injected at the top of every locale home of
 * profile-configured sites. Chip hrefs are page-relative via the base, so
 * subpath deploys stay intact.
 */
export function renderProfileCard(
  data: SiteProfile,
  ctx: ProfileCardContext,
): string {
  const t = messagesForLang(ctx.lang).profile;
  const name = escapeHtml(data.name, { attr: false });
  const avatar = data.avatar
    ? `<img class="ap-home-profile__avatar-img" src="${escapeHtml(
        linkHref(ctx.base, data.avatar),
      )}" alt="${escapeHtml(data.name)}">`
    : '';
  const link =
    data.link === undefined ? undefined : linkHref(ctx.base, data.link);
  const articlesHref =
    data.articlesLink === undefined ? ctx.pages?.timeline : data.articlesLink;
  const stats = [
    statHtml(
      data.articles,
      t.posts,
      articlesHref === undefined ? undefined : linkHref(ctx.base, articlesHref),
    ),
    statHtml(
      data.categoryChips.length,
      t.categories,
      ctx.pages?.categories === undefined
        ? `#${CATS_ANCHOR}`
        : linkHref(ctx.base, ctx.pages.categories),
    ),
    statHtml(
      data.tagChips.length,
      t.tags,
      ctx.pages?.tags === undefined
        ? `#${TAGS_ANCHOR}`
        : linkHref(ctx.base, ctx.pages.tags),
    ),
  ].join('');
  const social = ctx.social
    .map(s => {
      const svg = iconSvg(
        s.icon,
        // Same overlay as socialIconSet: builtin brand glyphs under the
        // site-registered keys.
        { ...BUILTIN_SOCIAL_ICONS, ...ctx.icons },
      );
      return `<a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(s.title)}" aria-label="${escapeHtml(s.title)}">${svg}</a>`;
    })
    .join('');
  return (
    `<section class="ap-home-profile"><div class="ap-home-profile__card">` +
    wrapLink(link, avatar, 'ap-home-profile__avatar') +
    wrapLink(link, name, 'ap-home-profile__name') +
    `<div class="ap-home-profile__stats">${stats}</div>` +
    `<div class="ap-home-profile__social">${social}</div>` +
    groupHtml('category', data.categoryChips, t.categories, ctx.base) +
    groupHtml('tag', data.tagChips, t.tags, ctx.base) +
    `</div></section>`
  );
}
