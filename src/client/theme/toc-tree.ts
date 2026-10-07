import type { Heading } from '../../shared/types';

export interface TocNode {
  heading: Heading;
  children: TocNode[];
}

/**
 * Build an h2 -> h3 tree from flat headings.
 * Other levels are dropped; an h3 before any h2 stays top-level.
 */
export function buildTocTree(headings: readonly Heading[]): TocNode[] {
  const roots: TocNode[] = [];
  for (const heading of headings) {
    const node: TocNode = { heading, children: [] };
    if (heading.level === 2) {
      roots.push(node);
    } else if (heading.level === 3) {
      const parent = roots[roots.length - 1];
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }
  return roots;
}

/** Slugs in display order, for IntersectionObserver bookkeeping. */
export function flattenTocSlugs(nodes: readonly TocNode[]): string[] {
  const slugs: string[] = [];
  for (const node of nodes) {
    slugs.push(node.heading.slug);
    for (const child of node.children) {
      slugs.push(child.heading.slug);
    }
  }
  return slugs;
}

/**
 * Top-level rows fold behind a toggle past this many total entries (L12):
 * pages like the blog log emit ~198 dated h3s and the years drown; folding
 * keeps every entry reachable without a TOC scrollbar.
 */
export const TOC_FOLD_THRESHOLD = 40;

/** Total entry count including descendants. */
export function tocEntryCount(nodes: readonly TocNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + tocEntryCount(node.children);
  }
  return count;
}

/**
 * True when the given slug sits anywhere under one of the roots (used to
 * auto-expand the folded group that owns the scroll-spy highlight).
 */
export function tocDescendsFrom(
  roots: readonly TocNode[],
  slug: string,
): TocNode | null {
  for (const root of roots) {
    if (root.heading.slug === slug) return root;
    for (const child of root.children) {
      if (child.heading.slug === slug) return root;
    }
  }
  return null;
}
