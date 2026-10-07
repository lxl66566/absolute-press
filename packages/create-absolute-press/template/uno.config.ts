import { presetWind4, type Theme } from '@unocss/preset-wind4';
import { defineConfig, type UserConfig } from 'unocss';

const config: UserConfig<Theme> = defineConfig({
  presets: [presetWind4()],
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
