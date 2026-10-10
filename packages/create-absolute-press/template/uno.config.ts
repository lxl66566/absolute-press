import { presetWind4, type Theme } from '@unocss/preset-wind4';
import { defineConfig, type UserConfig } from 'unocss';

// outputToCssLayers is required by the framework's cascade contract: without
// it uno's unlayered reset outranks every layered framework rule and strips
// paddings/borders from chrome components (drawer counts, timeline, terms).
const config: UserConfig<Theme> = defineConfig({
  presets: [presetWind4()],
  outputToCssLayers: true,
  preflights: [
    {
      // 主题里非链接的可点控件（按钮、CSS-only tabs 的 label）给手型光标
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
