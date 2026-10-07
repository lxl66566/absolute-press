import { presetWind4, type Theme } from '@unocss/preset-wind4';
import { defineConfig, type UserConfig } from 'unocss';

const config: UserConfig<Theme> = defineConfig({
  presets: [presetWind4()],
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
