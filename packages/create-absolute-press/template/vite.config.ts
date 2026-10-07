import { absolutePress, defineSiteConfig } from 'absolute-press';
import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  build: {
    target: 'esnext',
  },
  plugins: [
    UnoCSS(),
    solidPlugin(),
    absolutePress(
      defineSiteConfig({
        contentDir: 'src',
        title: 'My Blog',
        description: '站点描述，进入 SEO 与 RSS',
        // 改成你的正式域名（用于 RSS/sitemap/og）
        hostname: 'https://example.com',
      }),
    ),
  ],
});
