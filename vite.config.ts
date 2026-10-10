import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/app-icon.svg', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon.ico', 'icons/icon-16.png', 'icons/icon-32.png', 'brand/logo-light.svg', 'brand/logo-dark.svg', 'brand/logo-mono.svg', 'privacy.html', 'account-deletion.html'],
        workbox: {
          skipWaiting: false,
          importScripts: ['/pwa-upgrade-bridge.js', '/attendance-push-worker.js'],
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/api\//, /^\/privacy\.html$/, /^\/account-deletion\.html$/],
        },
        manifest: {
          name: 'وفر دوام | WAFR Dawam',
          short_name: 'وفر دوام',
          description: 'تطبيق متكامل لإدارة الجداول الزمنية والحضور والانصراف وجداول العمل للموظفين',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#F4F8F7',
          theme_color: '#102C3A',
          lang: 'ar',
          dir: 'rtl',
          categories: ['business', 'productivity'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            {
              name: 'بوابة الموظف',
              short_name: 'الموظف',
              description: 'تسجيل الحضور والانصراف',
              url: '/?tab=emp',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
