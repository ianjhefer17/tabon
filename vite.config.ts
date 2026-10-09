import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in main.tsx so updates reload the page
      manifest: {
        name: 'Tabon — Private Document Redactor',
        short_name: 'Tabon',
        description: 'Redact personal info from documents, fully on-device.',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        // App shell + self-hosted OCR/pdf.js assets under /public are precached.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,mjs,gz,bcmap,pfb,ttf,icc}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
        // New versions take over immediately; registerSW in main.tsx then reloads the page.
        // (The plugin only sets these itself when it injects the register script.)
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
