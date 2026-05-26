import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'icons/apple-touch-icon.svg',
          'icons/pwa-192x192.svg',
          'icons/pwa-512x512.svg',
          'icons/maskable-icon.svg',
        ],
        manifest: {
          name: 'Saude em Acao',
          short_name: 'Saude em Acao',
          description: 'Aplicativo de gestao de saude territorial para ACS.',
          lang: 'pt-BR',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#0f766e',
          background_color: '#f8fafc',
          icons: [
            {
              src: '/icons/pwa-192x192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icons/pwa-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icons/maskable-icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({request}) => request.destination === 'document',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'html-cache',
                networkTimeoutSeconds: 5,
              },
            },
            {
              urlPattern: ({request}) =>
                ['style', 'script', 'worker'].includes(request.destination),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'asset-cache',
              },
            },
            {
              urlPattern: ({request}) => request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'image-cache',
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
