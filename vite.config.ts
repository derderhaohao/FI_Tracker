/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo-name>/.
const base = process.env.VITE_BASE ?? '/FI_Tracker/';

// The built app may only talk to its own origin. Added at build time only,
// because the dev server needs a websocket for hot reload.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'fi-tracker-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />`,
      );
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
    // Installable, works offline (P2). New versions wait for the user to reload.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FI Tracker',
        short_name: 'FI Tracker',
        description: 'Net worth, cash flow and FI strategy simulator. Data stays on this device.',
        theme_color: '#0f766e',
        background_color: '#f9f9f7',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
        // Time Machine prices (TM-4): kept after first use so used tickers work offline, and
        // refreshed in the background so a monthly update shows up on the next visit.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/prices/') && url.pathname.endsWith('.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'time-machine-prices',
              expiration: { maxEntries: 400 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  // One user, loaded once and then offline: a single bundle is fine.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/db/**', 'src/io/**'],
      exclude: ['**/*.test.ts'],
    },
  },
});
