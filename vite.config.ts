import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { defineConfig, type Connect, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// AI models downloaded by `npm run models` (scripts/download-models.mjs). Its model library .wasm
// is fetched last, so a model counts as complete only once its library is present too.
const MODELS_DIR = 'models'
const MODEL_LIBS: Record<string, string> = {
  'Qwen2.5-3B-Instruct-q4f16_1-MLC': 'Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': 'Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm',
}
const localModels = Object.entries(MODEL_LIBS)
  .filter(([id, lib]) => existsSync(join(MODELS_DIR, id, 'ndarray-cache.json')) && existsSync(join(MODELS_DIR, 'libs', lib)))
  .map(([id, lib]) => ({ id, lib }))

const TYPES: Record<string, string> = { '.json': 'application/json', '.wasm': 'application/wasm', '.txt': 'text/plain' }

// Serves models/ at /models/ in `vite` and `vite preview`, mapping WebLLM's Hugging Face style
// paths (/models/<id>/resolve/main/<file>) onto the downloaded files (models/<id>/<file>).
function serveModels(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace('/resolve/main/', '/')
    const file = normalize(join(MODELS_DIR, path))
    if (!file.startsWith(MODELS_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
    res.setHeader('Content-Length', statSync(file).size)
    createReadStream(file).pipe(res)
  }
  return {
    name: 'tabon-serve-models',
    configureServer: (server) => void server.middlewares.use('/models', handler),
    configurePreviewServer: (server) => void server.middlewares.use('/models', handler),
  }
}

// https://vite.dev/config/
export default defineConfig({
  // The WebLLM worker (src/workers/llm.worker.ts) is an ES module.
  worker: { format: 'es' },
  define: { __LOCAL_MODELS__: JSON.stringify(localModels) },
  plugins: [
    serveModels(),
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
        // eng.traineddata.gz), /pdfjs/** (worker, CMaps, fonts, decoders; whole folder, any file type)
        // and /samples/**. Model weights are cached by WebLLM itself.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,wasm,mjs,gz,bcmap,pfb,ttf,icc}', 'pdfjs/**/*'],
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
