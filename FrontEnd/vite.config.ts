import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VitePWA is imported only for production builds.
// In development it registers a service worker via /@vite-plugin-pwa/pwa-entry-point-loaded
// even when devOptions.enabled is false, which caches stale JS modules and causes
// the browser to show a blank page after the first load. The PWA plugin is only
// activated when building for production (VITE_PWA=1 env var or `npm run build`).
const isProd = process.env.NODE_ENV === 'production';

const pwaPlugin = async () => {
  if (!isProd) return [];
  const { VitePWA } = await import('vite-plugin-pwa');
  return [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'FinalStore',
        short_name: 'FinalStore',
        description: 'Online store',
        theme_color: '#134ECD',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.ico', sizes: '64x64', type: 'image/x-icon' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ];
};

export default defineConfig(async () => ({
  plugins: [
    react(),
    ...(await pwaPlugin()),
  ],
  server: {
    port: 5174,
    strictPort: true,
    // Stabilise HMR under Brave/Chrome: use explicit ws host so the browser
    // does not fall back to page-reload mode on every file change.
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5174,
      // Don't block the page if HMR fails — just log it.
      timeout: 30000,
    },
  },
  // Let Vite pre-bundle ALL dependencies (including lucide-react).
  // Excluding lucide-react forces the browser to fetch ~400 individual ESM
  // modules on every HMR update, which overwhelms the renderer and shows
  // "Page Unresponsive" in Brave/Chrome.
  optimizeDeps: {
    include: ['lucide-react'],
  },
}));