import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['umu-logo.png', 'icons/*.png', 'icons/favicon.ico'],
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // Drop precached assets from previous deploys and activate the new
        // service worker immediately — prevents mixed-version chunk crashes
        // like "Cannot read properties of undefined" after a redeploy.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
