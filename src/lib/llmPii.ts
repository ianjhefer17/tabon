import type { AppConfig, WebWorkerMLCEngine } from '@mlc-ai/web-llm'
import type { PiiType, Span } from '../types'
import { findFuzzySpan, findSubstringSpans } from './match'

// Local LLM PII detection with WebLLM (WebGPU), running in src/workers/llm.worker.ts.
// web-llm is imported lazily so it stays out of the main bundle and the helpers below stay testable.

export type ModelKey = 'standard' | 'lite'

export const MODELS: Record<ModelKey, { id: string; f32Id: string; label: string }> = {
  standard: { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', f32Id: 'Qwen2.5-3B-Instruct-q4f32_1-MLC', label: 'Standard — Qwen2.5 3B (1.7 GB)' },
  lite: { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', f32Id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', label: 'Lite — Qwen2.5 1.5B (0.9 GB)' },
}

const MODEL_STORAGE_KEY = 'tabon.model'

export function getSavedModel(): ModelKey {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) === 'lite' ? 'lite' : 'standard'
  } catch {
    return 'standard'
  }
}

export function saveModel(key: ModelKey) {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, key)
  } catch {
    // Storage blocked (private mode): the choice just isn't remembered.
  }
}

export type GpuSupport = { ok: true; f16: boolean } | { ok: false; reason: string }

/** WebGPU availability, and whether the GPU supports f16 shaders (needed by the q4f16 builds). */
export async function checkWebGPU(): Promise<GpuSupport> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu
  if (!gpu) return { ok: false, reason: 'no navigator.gpu' }
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { ok: false, reason: 'no GPU adapter' }
    return { ok: true, f16: adapter.features.has('shader-f16') }
  } catch (err) {
    return { ok: false, reason: String(err) }
  }
}

export interface LoadProgress {
  /** 0-100 */
  percent: number
  text: string
  /** True when weights come from this device's cache rather than the network. */
  fromCache: boolean
}

let engine: WebWorkerMLCEngine | null = null
let loadedModelId: string | null = null
let enginePromise: Promise<WebWorkerMLCEngine> | null = null

// Loads run one after another so overlapping calls (React StrictMode, quick model switches)
// never create a second worker or reload mid-load.
let loadQueue: Promise<unknown> = Promise.resolve()

/** Loads (or switches to) a model. Safe to call repeatedly; returns the model id actually loaded. */
export function loadLlm(key: ModelKey, f16: boolean, onProgress?: (p: LoadProgress) => void): Promise<string> {
  const run = loadQueue.then(() => loadNow(key, f16, onProgress))
  loadQueue = run.catch(() => undefined)
  return run
}

async function loadNow(key: ModelKey, f16: boolean, onProgress?: (p: LoadProgress) => void): Promise<string> {
  const modelId = f16 ? MODELS[key].id : MODELS[key].f32Id
  const webllm = await import('@mlc-ai/web-llm')
  const appConfig = makeAppConfig(webllm)
  const fromCache = await isModelCached(modelId)
  const initProgressCallback = (r: { progress: number; text: string }) =>
    onProgress?.({ percent: Math.round(r.progress * 100), text: r.text, fromCache })

  if (!enginePromise) {
    const worker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' })
    enginePromise = webllm.CreateWebWorkerMLCEngine(worker, modelId, { appConfig, initProgressCallback }).catch((err) => {
      enginePromise = null
      worker.terminate()
      throw err
    })
    engine = await enginePromise
  } else {
    engine = await enginePromise
    if (loadedModelId !== modelId) {
      loadedModelId = null
      engine.setInitProgressCallback(initProgressCallback)
      await engine.reload(modelId)
    }
  }
  loadedModelId = modelId
  warmUp()
  return modelId
}

// Store weights in IndexedDB. The default Cache API backend streams each download straight into
// the cache, which failed in testing ("Cache.add() encountered a network error") for the large
// Hugging Face shards even though the same files fetched fine.
// Models downloaded with `npm run models` load from this machine (/models/) instead of Hugging
// Face. The cache is keyed by URL, so a model cached from one source is not reused from the other.
function makeAppConfig(webllm: typeof import('@mlc-ai/web-llm')): AppConfig {
  const base = new URL(`${import.meta.env.BASE_URL}models/`, window.location.href)
  const model_list = webllm.prebuiltAppConfig.model_list.map((record) => {
    const local = __LOCAL_MODELS__.find((m) => m.id === record.model_id)
    if (!local) return record
    return {
      ...record,
      model: new URL(`${local.id}/resolve/main/`, base).href,
      model_lib: new URL(`libs/${local.lib}`, base).href,
    }
  })
  return { ...webllm.prebuiltAppConfig, model_list, cacheBackend: 'indexeddb' }
}

/** True when every weight shard of the model is stored on this device. */
export async function isModelCached(modelId: string): Promise<boolean> {
  const webllm = await import('@mlc-ai/web-llm')
  // Fast only with scripts/patch-webllm.mjs applied; unpatched, this reads all weights from disk.
  return webllm.hasModelInCache(modelId, makeAppConfig(webllm)).catch(() => false)
}

export function isLlmReady(): boolean {
  return engine !== null && loadedModelId !== null
}

export const SYSTEM_PROMPT =
  'You find personal information in OCR text from Philippine documents. Return ONLY JSON: {"pii":[{"text":"...","type":"name|address|id_number|phone|email|account|date"}]}. Rules: text must be copied EXACTLY as it appears. Include full personal names, home/service addresses, ID and account numbers, phone numbers, emails, birthdates. Do NOT include company names, bank names, headings, field labels, currency amounts, or transaction descriptions. If none, return {"pii":[]}.'

// Constrains generation to exactly the shape the prompt asks for. Also required in practice:
// web-llm 0.2.85 throws GrammarMatcherInitError for `json_object` without a schema
// (it calls compileJSONSchema(undefined)).
const PII_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    pii: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          type: { type: 'string', enum: ['name', 'address', 'id_number', 'phone', 'email', 'account', 'date'] },
        },
        required: ['text', 'type'],
        additionalProperties: false,
      },
    },
  },
  required: ['pii'],
  additionalProperties: false,
})

// OCR reads two-column forms across (see ocr.ts, PSM 6), so a label's value may sit elsewhere.
const USER_PREFIX =
  'OCR text below. It may come from a form with two columns read left to right, so a field label and its value are not always next to each other.\n\n'

// One worked example (fictional, unrelated to the bundled samples) shown as a prior exchange.
// Small models copy this format far more reliably than they follow instructions alone:
// one field value per item, copied exactly, labels and amounts left out.
const EXAMPLE_INPUT = `${USER_PREFIX}EMPLOYEE NAME EMPLOYEE NO.
MARIA CLARA REYES BAUTISTA EMP-0042
HOME ADDRESS
45 Mabini St., Brgy. Malanday,
Marikina City 1805
MOBILE NO. DATE OF BIRTH
0918 765 4321 1990-07-21
Basic Pay 25,000.00
Halimbawa Clinic Inc.`
const EXAMPLE_OUTPUT = JSON.stringify({
  pii: [
    { text: 'MARIA CLARA REYES BAUTISTA', type: 'name' },
    { text: 'EMP-0042', type: 'id_number' },
    { text: '45 Mabini St., Brgy. Malanday,\nMarikina City 1805', type: 'address' },
    { text: '0918 765 4321', type: 'phone' },
    { text: '1990-07-21', type: 'date' },
  ],
})

const CHUNK_THRESHOLD = 2500
const CHUNK_SIZE = 2000

/** Splits long text into ~CHUNK_SIZE pieces on line boundaries; short text stays whole. */
export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_THRESHOLD) return [text]
  const chunks: string[] = []
  let current = ''
  for (const line of text.split('\n')) {
    if (current && current.length + 1 + line.length > CHUNK_SIZE) {
      chunks.push(current)
      current = ''
    }
    current = current ? `${current}\n${line}` : line
    // A single very long line is split hard.
    while (current.length > CHUNK_SIZE) {
      chunks.push(current.slice(0, CHUNK_SIZE))
      current = current.slice(CHUNK_SIZE)
    }
  }
  if (current) chunks.push(current)
  return chunks
}

export interface LlmItem {
  text: string
  type: PiiType
}

const LLM_TYPES = new Set<PiiType>(['name', 'address', 'id_number', 'phone', 'email', 'account', 'date'])

/** Parses model output defensively: strips code fences, tolerates junk around the JSON, validates items. */
export function parseLlmJson(raw: string): LlmItem[] {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last <= first) return []
  s = s.slice(first, last + 1)
  try {
    const data: unknown = JSON.parse(s)
    const list = (data as { pii?: unknown })?.pii
    if (!Array.isArray(list)) return []
    const items: LlmItem[] = []
    for (const it of list) {
      const text = typeof it?.text === 'string' ? it.text.trim() : ''
      if (text.length < 2) continue
      const type = LLM_TYPES.has(it?.type) ? (it.type as PiiType) : 'other'
      items.push({ text, type })
    }
    return items
  } catch {
    return []
  }
}

// Currency amounts the model sometimes returns despite the prompt: "12,345.00", "PHP 2,500".
const AMOUNT = /^(?:(?:php|₱|p)\s*)?\d{1,3}(?:,\d{3})*(?:\.\d{2})?$|^\d+\.\d{2}$/i

/**
 * Locates each item in fullText (whitespace/case aside). If an item isn't there verbatim, the most
 * similar run of words (>= 85% alike, see findFuzzySpan) is used instead, so a small copy slip like
 * "JORAN" for "JUAN" still boxes the real name. Items with no such match are DROPPED: the model can
 * only ever point at text that is really on the page, and boxes always cover the page's own text.
 */
export function itemsToSpans(fullText: string, items: LlmItem[]): Span[] {
  const spans: Span[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (AMOUNT.test(item.text.replace(/\s+/g, ' '))) continue
    const exact = findSubstringSpans(fullText, item.text, item.type, 'llm')
    const fuzzy = exact.length ? null : findFuzzySpan(fullText, item.text, item.type, 'llm')
    for (const span of fuzzy ? [fuzzy] : exact) {
      const key = `${span.start}-${span.end}`
      if (seen.has(key)) continue
      seen.add(key)
      spans.push(span)
    }
  }
  return spans.sort((a, b) => a.start - b.start)
}

/** Opt-in local debugging: localStorage['tabon.debug'] = '1' logs raw model output to this browser's console only. */
function debugEnabled(): boolean {
  try {
    return localStorage.getItem('tabon.debug') === '1'
  } catch {
    return false
  }
}

// One request at a time: the engine is single-threaded.
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task)
  queue = run.catch(() => undefined)
  return run
}

/** One model request with the fixed system prompt and worked example. */
async function ask(engine: WebWorkerMLCEngine, text: string, maxTokens: number): Promise<string> {
  const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: EXAMPLE_INPUT },
      { role: 'assistant', content: EXAMPLE_OUTPUT },
      { role: 'user', content: USER_PREFIX + text },
    ],
    temperature: 0,
    max_tokens: maxTokens,
    response_format: { type: 'json_object', schema: PII_SCHEMA },
  })
  if (debugEnabled()) console.info('[tabon/llm] usage:', JSON.stringify(reply.usage))
  return reply.choices[0]?.message?.content ?? ''
}

/**
 * A throwaway request right after loading. The GPU's first real prompt ran ~4x slower than later
 * ones (measured on an M1: 37 vs 120-150 prompt tokens/s, a 23 s first scan instead of 10-14 s),
 * so this pays that cost before the user's first scan, which simply queues behind it.
 */
function warmUp() {
  enqueue(async () => {
    if (!engine) return
    const t0 = performance.now()
    await ask(engine, EXAMPLE_INPUT.slice(USER_PREFIX.length), 4)
    if (debugEnabled()) console.info(`[tabon/llm] warm-up ${Math.round(performance.now() - t0)} ms`)
  }).catch((err) => console.warn('AI warm-up failed', err))
}

/**
 * Finds PII with the LLM. `isCancelled` is checked between chunks, so a superseded scan (new
 * document, new model) stops early. We deliberately don't use engine.interruptGenerate(): in
 * web-llm 0.2.85 its flag is only cleared by streaming requests, so after an interrupt every
 * later non-streaming request returns "" instantly (or throws "Message error should not be 0").
 */
export function detectLlm(fullText: string, isCancelled: () => boolean = () => false): Promise<Span[]> {
  return enqueue(async () => {
    if (!engine) throw new Error('AI model is not loaded')
    const items: LlmItem[] = []
    for (const chunk of chunkText(fullText)) {
      if (isCancelled()) return []
      const content = await ask(engine, chunk, 1024)
      if (debugEnabled()) console.info('[tabon/llm] raw output:', content)
      items.push(...parseLlmJson(content))
    }
    const spans = itemsToSpans(fullText, items)
    if (debugEnabled()) {
      console.info('[tabon/llm] located spans:', spans.map((s) => `${s.type}: ${s.text}`))
    }
    return spans
  })
}
