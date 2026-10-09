import { presetWind4, type Theme } from '@unocss/preset-wind4';
import { defineConfig, type UserConfig } from 'unocss';

// outputToCssLayers puts uno's output into real @layer blocks (properties /
// theme / base / preflights / default) so the framework's cascade contract
// holds: the shell head declares the order once, uno's reset (`base`) stays
// under the framework prose layer, and utilities (`default`) beat prose but
// not framework chrome. Without this, uno's unlayered reset would outrank
// every layered framework rule and gut the typography. Consuming sites must
// set the same flag — see .agents/skills/css-cascade/SKILL.md.
const config: UserConfig<Theme> = defineConfig({
  presets: [presetWind4()],
  outputToCssLayers: true,
  preflights: [
    {
      // Global pointer affordance for interactive controls that are not
      // links: real buttons (unless disabled), ARIA buttons, and the tab
      // headers of the CSS-only radio tabs. Anchors keep the UA default.
      getCSS: () => `
button:not(:disabled),
[role='button']:not([aria-disabled='true']),
.ap-tabs > label {
  cursor: pointer;
}`,
    },
  ],
});

export default config;
