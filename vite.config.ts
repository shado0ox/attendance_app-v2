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
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/app-icon.svg'],
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/api\//],
        },
        manifest: {
          name: 'نظام إدارة الدوام والحضور',
          short_name: 'نظام الدوام',
          description: 'تطبيق متكامل لإدارة الجداول الزمنية والحضور والانصراف وجداول العمل للموظفين',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f0f9ff',
          theme_color: '#0284c7',
          lang: 'ar',
          dir: 'rtl',
          categories: ['business', 'productivity'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
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