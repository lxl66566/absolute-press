// Consumed through the package self-reference, exactly like a site island.
import { slotItems, XList } from 'absolute-press/client';
import type {
  BadgeTone,
  IslandProps,
  XListFilter,
  XListItem,
  XListPart,
} from 'absolute-press/client';
import { createMemo } from 'solid-js';
import type { Element as SolidElement } from 'solid-js';

/**
 * Docs demo island for the data-driven XList toolkit (guide/islands): a tiny
 * inline dataset mapped through slotItems, exercising a text column, numeric
 * `sortValue` columns, the per-column `sortable` whitelist (the 状态 header
 * keeps no triangle), the exclusion filter and expandable `@@@` slot bodies.
 */
interface DemoTool {
  name: string;
  language: string;
  /** GitHub stars in thousands. */
  stars: number;
  status: '活跃' | '缓慢' | '停更';
  /** Inactive project; the demo filter hides these rows when checked. */
  inactive?: boolean;
}

const TOOLS: readonly DemoTool[] = [
  { name: 'ripgrep', language: 'Rust', stars: 47.8, status: '活跃' },
  { name: 'fd', language: 'Rust', stars: 32.4, status: '活跃' },
  { name: 'bat', language: 'Rust', stars: 46.9, status: '活跃' },
  { name: 'fzf', language: 'Go', stars: 62.1, status: '活跃' },
  { name: 'jq', language: 'C', stars: 30.2, status: '缓慢', inactive: true },
  { name: 'eza', language: 'Rust', stars: 12.9, status: '活跃' },
  {
    name: 'xsv',
    language: 'Rust',
    stars: 10.1,
    status: '停更',
    inactive: true,
  },
];

const COLUMNS = ['工具', '语言', 'Stars', '状态'];

const STATUS_TONES: Record<DemoTool['status'], `is-${BadgeTone}`> = {
  活跃: 'is-success',
  缓慢: 'is-warning',
  停更: 'is-danger',
};

const INACTIVE_FILTER: XListFilter = {
  id: 'inactive',
  label: '仅显示活跃维护的工具',
  hint: '勾选后隐藏缓慢与停更的项目。',
};

const text = (value: string): XListPart => ({ kind: 'text', text: value });

const badge = (value: string, cls: `is-${BadgeTone}`): XListPart => ({
  kind: 'badge',
  text: value,
  cls,
});

function toTool(tool: DemoTool, key: string): XListItem {
  return {
    key,
    title: tool.name,
    filterFlags: tool.inactive ? [INACTIVE_FILTER.id] : undefined,
    cells: [
      { parts: [text(tool.language)], text: tool.language },
      {
        parts: [text(`${tool.stars.toFixed(1)}k`)],
        text: `${tool.stars.toFixed(1)}k`,
        sortValue: tool.stars,
      },
      {
        parts: [badge(tool.status, STATUS_TONES[tool.status])],
        text: tool.status,
      },
    ],
  };
}

export default function DemoXList(props: IslandProps): SolidElement {
  const items = createMemo(() =>
    slotItems(
      props.childrenHtml ?? '',
      TOOLS,
      tool => tool.name,
      toTool,
      'DemoXList',
    ),
  );
  // sortable whitelist: triangles on the title / 语言 / Stars headers only —
  // sorting badge text is meaningless, so 状态 stays a plain label.
  return (
    <XList
      items={items()}
      columns={COLUMNS}
      sortable={['title', 0, 1]}
      filters={[INACTIVE_FILTER]}
    />
  );
}
