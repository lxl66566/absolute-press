/**
 * Build-time author profile: per-locale taxonomy derivation (shared by the
 * static home card and the drawer's payload site block) and the static card
 * HTML. Like the RecentArticles build component, the card is final static
 * HTML — crawlers and no-JS clients see it without hydration.
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
import { groupArchiveArticles } from './archive.ts';
import { isNavExcluded } from './pages.ts';

/** Anchor ids of the card's chip groups (stats row jump targets). */
const CATS_ANCHOR = 'ap-home-profile-cats';
const TAGS_ANCHOR = 'ap-home-profile-tags';

/**
 * Profile data of one locale: the locale's article list (buildArticles
 * output — locale homes already excluded) minus the `profile.exclude` routes,
 * grouped exactly like the archive pages (case merging, lowercase order), so
 * chip counts always agree with the archives.
 */
export function buildSiteProfile(
  profile: ResolvedProfile,
  articles: ArticleInfo[],
  locale: LocaleInfo,
): SiteProfile {
  const kept = articles.filter(a => !isNavExcluded(a.route, profile.exclude));
  const chips = (kind: 'category' | 'tag'): ProfileChip[] =>
    groupArchiveArticles(kept, kind).map(group => ({
      name: group.name,
      count: group.articles.length,
      route: `${locale.prefix}/${kind}/${encodeURIComponent(group.name)}`,
    }));
  return {
    name: profile.name,
    ...(profile.avatar ? { avatar: profile.avatar } : {}),
    ...(profile.link ? { link: profile.link } : {}),
    ...(profile.articlesLink ? { articlesLink: profile.articlesLink } : {}),
    articles: kept.length,
    categories: chips('category'),
    tags: chips('tag'),
  };
}

/** Payload view of the profile data: taxonomy only, no card identity. */
export function drawerProfileOf(data: SiteProfile): ProfileTaxonomy {
  return {
    articles: data.articles,
    categories: data.categories,
    tags: data.tags,
  };
}

/**
 * Config icon value -> standalone svg string (same normalization as the
 * client FaIcon and the RecentArticles renderer): bare inner markup gets
 * the 24x24 currentColor wrapper. Unknown/blank -> ''.
 */
function iconSvg(key: string, icons: Record<string, string>): string {
  const trimmed = icons[key]?.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('<svg')
    ? trimmed
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${trimmed}</svg>`;
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
      )}" alt="">`
    : '';
  const link =
    data.link === undefined ? undefined : linkHref(ctx.base, data.link);
  const stats = [
    statHtml(
      data.articles,
      t.posts,
      data.articlesLink === undefined
        ? undefined
        : linkHref(ctx.base, data.articlesLink),
    ),
    statHtml(data.categories.length, t.categories, `#${CATS_ANCHOR}`),
    statHtml(data.tags.length, t.tags, `#${TAGS_ANCHOR}`),
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
    groupHtml('category', data.categories, t.categories, ctx.base) +
    groupHtml('tag', data.tags, t.tags, ctx.base) +
    `</div></section>`
  );
}
