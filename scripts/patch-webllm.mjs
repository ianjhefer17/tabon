// Patches @mlc-ai/web-llm 0.2.x after `npm install` (postinstall).
// Its IndexedDB cache checks whether model files exist with store.get(), which reads each value:
// the whole 1.7 GB of weights, just to answer "is it cached?", before reading them again to load.
// That added ~35 s to every app start in testing. store.getKey() answers the same question
// without reading the data.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules/@mlc-ai/web-llm/lib/index.js')
const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
if (src.includes('patched by scripts/patch-webllm.mjs')) {
  console.log('patch-webllm: already patched')
} else {
  // Match regardless of the leading tab/space indentation in the published file.
  const re = /const request = store\.get\(key\);(\s*)request\.onsuccess = \(\) => \{(\s*)if \(request\.result === undefined\) \{/
  const matches = src.match(new RegExp(re, 'g'))
  if (matches?.length !== 1) {
    console.error(`patch-webllm: expected 1 match in ${file}, found ${matches?.length ?? 0}. web-llm changed; update this script.`)
    process.exit(1)
  }
  writeFileSync(file, src.replace(re, 'const request = store.getKey(key); // patched by scripts/patch-webllm.mjs$1request.onsuccess = () => {$2if (request.result === undefined) {'))
  console.log('patch-webllm: IndexedDB hasAllKeys now uses getKey()')
}
