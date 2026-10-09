import { describe, expect, it } from 'vitest';

import { ICON_PROVIDER_NAMES, providerIcons } from '../icons.ts';

describe('providerIcons fontawesome', () => {
  const icons = providerIcons('fontawesome');

  it('registers every free pack under <pack>/<name>', () => {
    // Unique canonical names after alias dedup (solid ~1400 + brands/regular).
    expect(Object.keys(icons).length).toBeGreaterThan(2000);
    expect(icons['solid/rocket']).toBeDefined();
    expect(icons['regular/bell']).toBeDefined();
    expect(icons['brands/github']).toBeDefined();
  });

  it('renders full svg strings keeping the author viewBox', () => {
    // The pen glyph is non-square; a 24x24 wrap would distort it, so the
    // registered value must be a complete svg with the FA canvas.
    expect(icons['solid/pen']).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512" fill="currentColor"><path d="/,
    );
    expect(icons['solid/pen']).toMatch(/<\/svg>$/);
  });

  it('dedupes alias exports to one canonical key', () => {
    // faTrashAlt and faTrashCan are alias exports of one glyph; the
    // registry keys by canonical iconName, so only one entry survives.
    expect(icons['solid/trash-can']).toBeDefined();
    expect(icons['solid/trash-alt']).toBeUndefined();
  });

  it('exposes exactly the fontawesome provider', () => {
    expect(ICON_PROVIDER_NAMES).toEqual(['fontawesome']);
  });
});
