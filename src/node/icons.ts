// Built-in icon providers. A provider registers a glyph registry under
// `<pack>/<name>` keys (full `<svg>` strings); resolveConfig layers it
// under the site's custom `icons` map, so frontmatter `icon` references
// work without per-icon setup.
import { fab } from '@fortawesome/free-brands-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fas } from '@fortawesome/free-solid-svg-icons';

/** Built-in icon providers; extend the list (and `PROVIDERS`) for new ones. */
export const ICON_PROVIDER_NAMES = ['fontawesome'] as const;

export type IconProviderName = (typeof ICON_PROVIDER_NAMES)[number];

/** Structural subset of an FA glyph entry we consume. */
interface FaGlyph {
  /** Canonical kebab icon name (`circle-question`). */
  iconName: string;
  /** [width, height, ligatures, unicode, svg path data]. */
  icon: readonly [
    number,
    number,
    readonly string[],
    string,
    string | readonly string[],
  ];
}

/** One FA free pack as `<pack>/<name>` svg entries. The pack objects are
 * keyed by export name (`faRocket`) but each entry carries the canonical
 * kebab `iconName`, which becomes the registered key; alias exports share
 * one entry, so the map dedupes itself. */
function faPack(
  pack: 'brands' | 'regular' | 'solid',
  glyphs: Record<string, FaGlyph>,
): Record<string, string> {
  const icons: Record<string, string> = {};
  for (const glyph of Object.values(glyphs)) {
    const [width, height, , , pathD] = glyph.icon;
    // Multi-path glyphs ship the d as an array of subpaths.
    const d = typeof pathD === 'string' ? pathD : pathD.join(' ');
    icons[`${pack}/${glyph.iconName}`] =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"` +
      ` fill="currentColor"><path d="${d}"/></svg>`;
  }
  return icons;
}

const PROVIDERS: Record<IconProviderName, Record<string, string>> = {
  fontawesome: {
    ...faPack('solid', fas),
    ...faPack('regular', far),
    ...faPack('brands', fab),
  },
};

/** Icon registry of one built-in provider. */
export function providerIcons(name: IconProviderName): Record<string, string> {
  return PROVIDERS[name];
}
