// Downloads the AI models once into models/ (git-ignored) so the app serves them from this
// machine instead of Hugging Face. vite.config.ts serves models/ at /models/ and points WebLLM
// there for every model found. Safe to re-run: files already downloaded in full are skipped.
//
//   npm run models            # both models
//   npm run models -- lite    # one model (standard | lite)
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// Must match the web-llm version in package.json (prebuiltAppConfig in @mlc-ai/web-llm).
const LIB_BASE = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/'
const MODELS = {
  standard: { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', lib: 'Qwen2.5-3B-Instruct-q4f16_1_cs1k-webgpu.wasm' },
  lite: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', lib: 'Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm' },
}
const ROOT = 'models'

async function download(url, dest, size) {
  if (existsSync(dest) && (size === undefined || statSync(dest).size === size)) return false
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const tmp = `${dest}.part`
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
  renameSync(tmp, dest)
  return true
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MODELS)
for (const key of keys) {
  const model = MODELS[key]
  if (!model) throw new Error(`Unknown model "${key}" (use: ${Object.keys(MODELS).join(', ')})`)
  const info = await (await fetch(`https://huggingface.co/api/models/mlc-ai/${model.id}/tree/main`)).json()
  const files = info.filter((f) => f.type === 'file' && !f.path.startsWith('.') && f.path !== 'README.md')
  console.log(`${model.id}: ${files.length} files`)
  let done = 0
  for (const f of files) {
    const url = `https://huggingface.co/mlc-ai/${model.id}/resolve/main/${f.path}`
    await download(url, join(ROOT, model.id, f.path), f.size)
    process.stdout.write(`\r  ${++done}/${files.length}`)
  }
  await download(LIB_BASE + model.lib, join(ROOT, 'libs', model.lib))
  console.log(`\n  done (+ ${model.lib})`)
}
