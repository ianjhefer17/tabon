import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // The WebLLM worker (src/workers/llm.worker.ts) is an ES module.
  worker: { format: 'es' },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/lib/pwa.ts so reloads never wipe an open document
      manifest: {
        name: 'Tabon',
        short_name: 'Tabon',
        description: 'Redact personal info from documents, fully on-device.',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell plus everything under /public: /tesseract/** (worker, wasm cores,
        // eng.traineddata.gz), /pdfjs/** and /samples/**. Model weights are cached by WebLLM itself.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,wasm,mjs,gz,bcmap,pfb,ttf,icc}'],
        // macOS resource forks appear when the repo lives on an exFAT drive.
        globIgnores: ['**/._*'],
        // The Tesseract cores are ~4 MB each; the largest bundle chunk (web-llm) is a few MB.
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        // New versions take over immediately; src/lib/pwa.ts then decides when to reload.
        // (The plugin only sets these itself when it injects the register script.)
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
