import { DOMParser } from 'linkedom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { slotItems } from '../items';
import { assignSlotKeys } from '../slotKey';
import type { XListItem } from '../types';

// parseStaticChildren runs against the browser DOMParser; node tests borrow
// linkedom's implementation (same approach as ExpandableList.test.ts).
beforeAll(() => {
  vi.stubGlobal('DOMParser', DOMParser);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

/** Minimal static markup as the entry-list pipeline (markdown/entries.ts)
 * emits it: item row (title cell = the `@@@` key) + body row pairs. */
function entryList(rows: string): string {
  return (
    '<div class="ap-xlist"><table class="ap-xlist__table"><tbody>' +
    rows +
    '</tbody></table></div>'
  );
}

function itemRow(key: string): string {
  return (
    '<tr class="ap-xlist__item">' +
    `<td class="ap-xlist__item-title">${key}</td>` +
    '</tr>'
  );
}

function bodyRow(html: string): string {
  return (
    '<tr class="ap-xlist__item-expanded">' +
    '<td class="ap-xlist__reveal-cell">' +
    `<div class="ap-xlist__item-body">${html}</div>` +
    '</td></tr>'
  );
}

const toItem = (name: string, key: string): XListItem => ({
  key,
  title: name,
  cells: [],
});

describe('assignSlotKeys', () => {
  it('passes unique base keys through untouched', () => {
    expect(assignSlotKeys(['a', 'b'], s => s).map(e => e.key)).toEqual([
      'a',
      'b',
    ]);
  });

  it('suffixed duplicate base keys with #2, #3 in raw order', () => {
    expect(assignSlotKeys(['a', 'a', 'a'], s => s).map(e => e.key)).toEqual([
      'a',
      'a#2',
      'a#3',
    ]);
  });

  it('a duplicate skips suffixes already taken by literal base keys', () => {
    // The literal 'a#2' occupies its own base key first; the second plain
    // 'a' must not collide with it.
    expect(assignSlotKeys(['a', 'a#2', 'a'], s => s).map(e => e.key)).toEqual([
      'a',
      'a#2',
      'a#3',
    ]);
  });
});

describe('slotItems', () => {
  it('pairs data rows with slot bodies by key', () => {
    const html = entryList(
      itemRow('Clannad') +
        bodyRow('<p>long</p>') +
        itemRow('GAL') +
        bodyRow(''),
    );
    const items = slotItems(html, ['Clannad', 'GAL'], s => s, toItem, 'test');
    expect(items.map(item => [item.key, item.bodyHtml])).toEqual([
      ['Clannad', '<p>long</p>'],
      ['GAL', ''],
    ]);
  });

  it('pairs duplicate base keys through their #k suffixes', () => {
    const html = entryList(
      itemRow('A') + bodyRow('<p>1</p>') + itemRow('A#2') + bodyRow('<p>2</p>'),
    );
    const items = slotItems(html, ['A', 'A'], s => s, toItem, 'test');
    expect(items.map(item => [item.key, item.bodyHtml])).toEqual([
      ['A', '<p>1</p>'],
      ['A#2', '<p>2</p>'],
    ]);
  });

  it('drops slots matching no data item with a console warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const html = entryList(itemRow('gone') + bodyRow('<p>x</p>'));
      const items = slotItems(html, ['kept'], s => s, toItem, 'MyList');
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ key: 'kept', bodyHtml: '' });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('MyList');
      expect(warn.mock.calls[0]?.[0]).toContain('gone');
    } finally {
      warn.mockRestore();
    }
  });
});
