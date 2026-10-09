// Copies runtime assets from node_modules into public/ so the app never loads them from a CDN.
// Runs automatically on `npm install` (postinstall).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
]

let missing = 0
for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.error(`copy-assets: missing ${from}`)
    missing++
    continue
  }
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  console.log(`copy-assets: ${to.slice(root.length + 1)}`)
}
if (missing) process.exit(1)
