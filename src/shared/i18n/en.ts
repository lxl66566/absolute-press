import type { Messages } from './zh.ts';

/** en messages — `satisfies` enforces key parity with zh at compile time. */
export const en = {
  nav: {
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    switchToDark: 'Switch to dark mode',
    switchToLight: 'Switch to light mode',
    switchLocale: 'Change language',
    rss: 'RSS feed',
  },
  sidebar: {
    expandGroup: 'Expand group',
    collapseGroup: 'Collapse group',
    resizeWidth: 'Resize sidebar',
  },
  toc: {
    title: 'On this page',
    backToTop: 'Back to top',
  },
  article: {
    createdAt: 'Created',
    lastUpdated: 'Last updated',
    // Build-time estimate still lands in the payload; the article meta row
    // does not render it for now (reserved for archive cards etc.).
    readingTime: '{n} min read',
    category: 'Category',
    tag: 'Tag',
  },
  feed: {
    empty: 'No articles yet',
  },
  recent: {
    /** Column headings of the RecentArticles build component. */
    latest: 'Latest articles',
    updated: 'Recently updated',
  },
  archive: {
    categoryTitle: 'Category: {name}',
    tagTitle: 'Tag: {name}',
    empty: 'No articles in this group',
  },
  pagination: {
    prev: 'Previous',
    next: 'Next',
    pageLabel: 'Page {n}',
  },
  related: {
    title: 'Related articles',
  },
  heimu: {
    /** Default hover tooltip baked into spoiler bars at build time. */
    tip: 'You know too much',
  },
  mermaid: {
    /** aria-label of the small reset button on pan/zoom diagrams. */
    resetZoom: 'Reset zoom',
    /** title hint describing the diagram interactions. */
    zoomHint: 'Ctrl+scroll to zoom · drag to pan · double-click to reset',
  },
  zoomedImg: {
    /** veil text over a masked image until it is revealed by click. */
    clickToView: 'Click to view',
  },
  search: {
    placeholder: 'Search docs',
    label: 'Search',
  },
  xlist: {
    searchPlaceholder: 'Filter entries…',
    sortLabel: 'Sort order',
    sortDefault: 'Default order',
    sortTitleAsc: 'Title ascending',
    sortTitleDesc: 'Title descending',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    expandHint: 'Click a table row to expand its details!',
    count: '{shown} / {total} items',
    empty: 'No matching entries',
    untitled: 'Untitled entry',
  },
  gate: {
    title: 'This page is encrypted',
    hint: 'Hint: {hint}',
    placeholder: 'Enter password',
    submit: 'Unlock',
    error: 'Incorrect password, please try again',
    remember: 'Remember password',
  },
  notFound: {
    /** Standalone 404 page copy; emitted with the default locale. */
    title: 'Page not found',
    message: 'The page you are looking for does not exist or has been moved.',
    backHome: 'Back to home',
  },
} satisfies Messages;
