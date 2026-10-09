// Copies runtime assets from node_modules into public/ so the app never loads them from a CDN.
// Runs automatically on `npm install` (postinstall).
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = (p) => join(root, 'node_modules', p)
const pub = (p) => join(root, 'public', p)

const files = [
  // Tesseract worker
  [nm('tesseract.js/dist/worker.min.js'), pub('tesseract/worker.min.js')],
  // Tesseract core, LSTM-only builds (wasm embedded). The worker picks one by CPU feature support.
  [nm('tesseract.js-core/tesseract-core-lstm.wasm.js'), pub('tesseract/core/tesseract-core-lstm.wasm.js')],
  [nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'), pub('tesseract/core/tesseract-core-simd-lstm.wasm.js')],
  [nm('tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js'), pub('tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js')],
  // pdf.js worker
  [nm('pdfjs-dist/build/pdf.worker.min.mjs'), pub('pdfjs/pdf.worker.min.mjs')],
]

// pdf.js data folders: CJK CMaps, the 14 standard fonts, image-decoder wasm (JPEG 2000, JBIG2, color profiles).
const dirs = [
  [nm('pdfjs-dist/cmaps'), pub('pdfjs/cmaps')],
  [nm('pdfjs-dist/standard_fonts'), pub('pdfjs/standard_fonts')],
  [nm('pdfjs-dist/wasm'), pub('pdfjs/wasm')],
  [nm('pdfjs-dist/iccs'), pub('pdfjs/iccs')],
]

// Skip macOS resource forks (._*) and the JS scripting sandbox, which the app never enables.
const keep = (src) => !basename(src).startsWith('._') && !basename(src).startsWith('quickjs-eval')

let missing = 0
for (const [from, to] of [...files, ...dirs]) {
  if (!existsSync(from)) {
    console.error(`copy-assets: missing ${from}`)
    missing++
    continue
  }
  mkdirSync(dirname(to), { recursive: true })
  if (files.some(([f]) => f === from)) {
    copyFileSync(from, to)
  } else {
    rmSync(to, { recursive: true, force: true })
    cpSync(from, to, { recursive: true, filter: keep })
  }
  console.log(`copy-assets: ${to.slice(root.length + 1)}`)
}
if (missing) process.exit(1)
