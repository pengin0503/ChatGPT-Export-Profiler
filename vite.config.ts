import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'service-worker.ts',
      injectRegister: 'script',
      registerType: 'autoUpdate',
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,json,webmanifest,svg,png,ico,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      }
    })
  ]
});
