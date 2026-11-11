import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages menyajikan situs di https://<user>.github.io/<repo>/
// BASE_PATH bisa dioverride saat build (mis. "/" untuk domain kustom).
const base = process.env.BASE_PATH ?? '/rps-editor/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'RPS Editor',
        short_name: 'RPS Editor',
        description: 'Buat dan edit Rencana Pembelajaran Semester (RPS), ekspor ke PDF.',
        lang: 'id',
        theme_color: '#1f4e8c',
        background_color: '#f3f4f6',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        file_handlers: [
          { action: '.', accept: { 'application/x-rps': ['.rps'], 'application/json': ['.json'] } }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,ttf,woff2}'],
        // Modul opsional jsPDF (html2canvas, DOMPurify, canvg) tidak dipakai aplikasi ini.
        globIgnores: ['**/html2canvas-*.js', '**/purify.es-*.js', '**/index.es-*.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ]
});
