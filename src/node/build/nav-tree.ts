import { isExternalHref } from '../../shared/links.ts';
import type {
  CuratedNavItem,
  NavItem,
  SidebarItem,
} from '../../shared/types.ts';
import { navLinkOf } from '../../shared/types.ts';
import type { NavbarDirTweak } from '../config.ts';
import { INDEX_STEMS, isLocaleHome, isNavExcluded, stemOf } from './pages.ts';
import type { PageSource, RenderedPage } from './pages.ts';

// ---------------------------------------------------------------------------
// Nav tree: shared shape behind navbar (NavItem) and sidebar (SidebarItem)
// ---------------------------------------------------------------------------

/** Folder row of the navbar tree (the only NavItem shape tweaks rewrite). */
type NavFolder = Extract<NavItem, { kind: 'folder' }>;

interface TreeDir {
  name: string;
  /** Title of the directory's own index page (index.md / README.md). */
  title: string | null;
  index: RenderedPage | null;
  pages: RenderedPage[];
  dirs: Map<string, TreeDir>;
}

function newDir(name: string): TreeDir {
  return { name, title: null, index: null, pages: [], dirs: new Map() };
}

/** `<dir>/index.md` or `<dir>/README.md`; the locale home is filtered earlier. */
function isDirIndex(page: PageSource): boolean {
  return page.relPath.includes('/') && INDEX_STEMS.has(stemOf(page.relPath));
}

/** Frontmatter opt-out: the index page stays the folder link, but never a
 * navbar overview row (see dirNavItem). */
function overviewOff(index: RenderedPage): boolean {
  return index.meta.frontmatter.overview === false;
}

/** Build the directory tree of one locale (home page excluded). */
function buildTree(pages: RenderedPage[], exclude: string[]): TreeDir {
  const root = newDir('');
  for (const page of pages) {
    if (isLocaleHome(page) || isNavExcluded(page.route, exclude)) continue;
    const segs = page.relPath.split('/');
    let node = root;
    for (const seg of segs.slice(0, -1)) {
      let next = node.dirs.get(seg);
      if (!next) {
        next = newDir(seg);
        node.dirs.set(seg, next);
      }
      node = next;
    }
    if (isDirIndex(page)) {
      node.index = page;
      node.title = page.meta.title || null;
    } else {
      node.pages.push(page);
    }
  }
  return root;
}

function linkText(page: RenderedPage): string {
  return page.meta.title || page.relPath.replace(/\.md$/, '');
}

function dirLabel(dir: TreeDir): string {
  return dir.title ?? dir.name;
}

/** One generated nav leaf item for a page; index pages carry the overview flag. */
function dirToNavItem(page: RenderedPage): NavItem {
  return {
    kind: 'leaf',
    text: linkText(page),
    link: page.route,
    ...(isDirIndex(page) && page.meta.frontmatter.overview !== false
      ? { index: true }
      : {}),
    ...(page.meta.frontmatter.icon ? { icon: page.meta.frontmatter.icon } : {}),
  };
}

/**
 * One directory's navbar row. Folder rows navigate to the folder's index
 * page (板块名即总览 — the sidebar contract), except that the two levels
 * surface the index differently: a top-level row lives in the bar, detached
 * from its panel, so the panel keeps the index as its flagged overview row;
 * a nested row sits right above its flyout, so the index would repeat the
 * row's own destination inside the panel and is row-only there. Frontmatter
 * `overview: false` on the index page drops the overview row at either
 * level (the client reads the folder's `overview` marker); the row itself
 * keeps navigating there.
 */
function dirNavItem(
  sub: TreeDir,
  tweaks?: Record<string, NavbarDirTweak>,
  order?: string[],
  parentDepth = 0,
): NavFolder {
  // Tweaks are a top-level concern: only the navbar's first level is
  // relabeled/grouped by the site config.
  const tweak = parentDepth === 0 ? tweaks?.[sub.name] : undefined;
  const children = dirToNavItems(sub, tweaks, order, parentDepth + 1);
  const idx = sub.index;
  const item: NavFolder = {
    kind: 'folder',
    text: dirLabel(sub),
    ...(idx ? { link: idx.route } : {}),
    ...(idx && overviewOff(idx) ? { overview: false } : {}),
    ...(parentDepth > 0 && idx
      ? // A nested row sits right above its flyout, so its index would
        // repeat the row's own destination inside the panel.
        { children: children.filter(child => navLinkOf(child) !== idx.route) }
      : { children }),
  };
  return tweak ? applyNavbarTweak(item, sub, tweak) : item;
}

/** Members of `dir` in generated order, paired with their tweak path. */
function generatedNavMembers(dir: TreeDir): [string, NavItem][] {
  const members: [string, NavItem][] = [];
  // An opted-out index is not auto-surfaced, even as the coverage append.
  if (dir.index && !overviewOff(dir.index))
    members.push([stemOf(dir.index.relPath), dirToNavItem(dir.index)]);
  for (const page of dir.pages)
    members.push([stemOf(page.relPath), dirToNavItem(page)]);
  for (const [name, sub] of dir.dirs) {
    members.push([name, dirNavItem(sub, undefined, undefined, 1)]);
  }
  return members;
}

/** Site-internal NavItem links (external hrefs excluded), flattened. */
function navLinksOf(item: NavItem, into: Set<string>): void {
  const link = navLinkOf(item);
  if (link !== undefined && !isExternalHref(link)) into.add(link);
  if (item.kind !== 'leaf')
    for (const child of item.children) navLinksOf(child, into);
}

/** Curated rows inherit the linked page's frontmatter icon when unset. */
function backfillNavIcon(
  item: NavItem,
  pagesByRoute: Map<string, RenderedPage>,
): NavItem {
  const link = navLinkOf(item);
  const page = link === undefined ? undefined : pagesByRoute.get(link);
  const icon =
    (item.kind === 'header' ? undefined : item.icon) ??
    page?.meta.frontmatter.icon;
  // Rebuild per kind: spreading the union would lose the discrimination.
  if (item.kind === 'leaf') {
    return { ...item, ...(icon ? { icon } : {}) };
  }
  if (item.kind === 'header') {
    return {
      kind: 'header',
      text: item.text,
      children: item.children.map(child =>
        backfillNavIcon(child, pagesByRoute),
      ),
    };
  }
  return {
    kind: 'folder',
    text: item.text,
    ...(item.link ? { link: item.link } : {}),
    ...(item.overview === false ? { overview: false } : {}),
    ...(icon ? { icon } : {}),
    children: item.children.map(child => backfillNavIcon(child, pagesByRoute)),
  };
}

/**
 * Normalize one curated config entry into the payload union: children make
 * a folder (link optional), a link makes a leaf. A childless entry without
 * a link has no renderable shape and is a config typo, not a silent text row.
 */
function toNavItem(item: CuratedNavItem): NavItem {
  if (item.children) {
    return {
      kind: 'folder',
      text: item.text,
      ...(item.link ? { link: item.link } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
      children: item.children.map(toNavItem),
    };
  }
  if (item.link === undefined) {
    throw new Error(
      `[absolute-press] navbar tweak: curated item "${item.text}" needs a link or children`,
    );
  }
  return {
    kind: 'leaf',
    text: item.text,
    link: item.link,
    ...(item.icon ? { icon: item.icon } : {}),
    ...(item.index ? { index: true } : {}),
  };
}

/**
 * Curated panel children (tweak `items`): every internal link must resolve
 * to a page under the directory — a curated entry pointing nowhere is a
 * config typo, not a dead link to discover in production. Curated rows
 * inherit the linked page's frontmatter icon (data modules curate
 * membership and order; icons stay content-driven). Generated members no
 * curated item links into keep their generated slot after the items, so a
 * curated layout cannot drop content silently either.
 */
function applyCuratedItems(dir: TreeDir, items: CuratedNavItem[]): NavItem[] {
  const pagesByRoute = new Map<string, RenderedPage>();
  const collect = (node: TreeDir): void => {
    if (node.index) pagesByRoute.set(node.index.route, node.index);
    for (const page of node.pages) pagesByRoute.set(page.route, page);
    for (const sub of node.dirs.values()) collect(sub);
  };
  collect(dir);
  const navItems = items.map(toNavItem);
  const covered = new Set<string>();
  for (const item of navItems) navLinksOf(item, covered);
  for (const link of covered) {
    if (!pagesByRoute.has(link)) {
      throw new Error(
        `[absolute-press] navbar tweak for "${dir.name}": curated item link ${link} matches no page under it`,
      );
    }
  }
  const children = navItems.map(item => backfillNavIcon(item, pagesByRoute));
  for (const [, member] of generatedNavMembers(dir)) {
    const links = new Set<string>();
    navLinksOf(member, links);
    if (![...links].some(link => covered.has(link))) children.push(member);
  }
  return children;
}

/** Apply one directory's navbar tweak: label override + group layout. */
function applyNavbarTweak(
  item: NavFolder,
  dir: TreeDir,
  tweak: NavbarDirTweak,
): NavFolder {
  // Curated items win over groups: the panel children are taken verbatim
  // (after route validation) instead of regrouping generated members.
  if (tweak.items) {
    return {
      ...item,
      ...(tweak.label ? { text: tweak.label } : {}),
      children: applyCuratedItems(dir, tweak.items),
    };
  }
  const generated = generatedNavMembers(dir);
  if (!tweak.groups) {
    return { ...item, ...(tweak.label ? { text: tweak.label } : {}) };
  }
  const used = new Set<string>();
  // The folder index page is already the top-level entry's destination, so
  // a curated group layout does not repeat it as a panel row.
  if (dir.index) used.add(stemOf(dir.index.relPath));
  const children: NavItem[] = [];
  for (const group of tweak.groups) {
    const items = group.items.flatMap(memberPath => {
      used.add(memberPath);
      const member = generated.find(([p]) => p === memberPath)?.[1];
      return member ? [member] : [];
    });
    if (group.text === undefined) children.push(...items);
    else if (items.length > 0)
      children.push({ kind: 'header', text: group.text, children: items });
  }
  // Unlisted members keep their generated slot after the groups: a tweak
  // curates emphasis, it must not drop content silently.
  for (const [memberPath, member] of generated) {
    if (!used.has(memberPath)) children.push(member);
  }
  return { ...item, ...(tweak.label ? { text: tweak.label } : {}), children };
}

/**
 * `order` (top level only): listed directories first in config order,
 * unknown names skipped, the rest appended in generated order — an entry
 * can never silently disappear.
 */
function orderedTopDirs(
  dirs: Map<string, TreeDir>,
  order: string[],
): Iterable<TreeDir> {
  const rest = new Map(dirs);
  const listed: TreeDir[] = [];
  for (const name of order) {
    const dir = rest.get(name);
    if (dir) {
      listed.push(dir);
      rest.delete(name);
    }
  }
  return [...listed, ...rest.values()];
}

function dirToNavItems(
  dir: TreeDir,
  tweaks?: Record<string, NavbarDirTweak>,
  order?: string[],
  depth = 0,
): NavItem[] {
  const items: NavItem[] = [];
  if (dir.index && !overviewOff(dir.index)) items.push(dirToNavItem(dir.index));
  for (const page of dir.pages) items.push(dirToNavItem(page));
  const subs =
    depth === 0 && order?.length
      ? orderedTopDirs(dir.dirs, order)
      : dir.dirs.values();
  for (const sub of subs) items.push(dirNavItem(sub, tweaks, order, depth));
  return items;
}

function dirToSidebarItems(
  dir: TreeDir,
  labels?: Record<string, string>,
): SidebarItem[] {
  const items: SidebarItem[] = [];
  for (const page of dir.pages) {
    items.push({
      kind: 'link',
      text: linkText(page),
      link: page.route,
      ...(page.meta.frontmatter.icon
        ? { icon: page.meta.frontmatter.icon }
        : {}),
    });
  }
  for (const sub of dir.dirs.values()) {
    items.push({
      kind: 'group',
      // Label follows the folder index's title, falling back to the dirname;
      // site config labels win over both (display-name decoupling).
      text: labels?.[sub.name] ?? dirLabel(sub),
      collapsible: true,
      children: dirToSidebarItems(sub, labels),
      // The folder row navigates to the folder's index page; the index page
      // does not repeat as a child. Index-less folders stay plain headers.
      ...(sub.index ? { link: sub.index.route } : {}),
      ...(sub.index?.meta.frontmatter.icon
        ? { icon: sub.index.meta.frontmatter.icon }
        : {}),
    });
  }
  return items;
}

/** Navbar + sidebar built from one shared directory tree. */
export interface NavChrome {
  navbar: NavItem[];
  sidebar: SidebarItem[];
}

/** Per-builder options; each maps 1:1 onto the standalone builders below. */
export interface ChromeOptions {
  /** Navbar per-directory tweaks (label/groups/items, top level only). */
  tweaks?: Record<string, NavbarDirTweak>;
  /** Top-level navbar directory order. */
  order?: string[];
  /** Sidebar display-name overrides keyed by top-level dir name. */
  labels?: Record<string, string>;
}

/**
 * Build navbar and sidebar from one directory tree: the two views share the
 * same tree shape, so callers needing both (SiteStore per-locale chrome)
 * must not pay the tree construction twice.
 */
export function buildChrome(
  pages: RenderedPage[],
  exclude: string[],
  options: ChromeOptions = {},
): NavChrome {
  const tree = buildTree(pages, exclude);
  return {
    navbar: dirToNavItems(tree, options.tweaks, options.order),
    sidebar: dirToSidebarItems(tree, options.labels),
  };
}

/** Sidebar only; use buildChrome() when both views are needed. */
export function buildSidebar(
  pages: RenderedPage[],
  exclude: string[],
  labels?: Record<string, string>,
): SidebarItem[] {
  return buildChrome(pages, exclude, { labels }).sidebar;
}

/** Navbar only; use buildChrome() when both views are needed. */
export function buildNavbar(
  pages: RenderedPage[],
  exclude: string[],
  tweaks?: Record<string, NavbarDirTweak>,
  order?: string[],
): NavItem[] {
  return buildChrome(pages, exclude, { tweaks, order }).navbar;
}
