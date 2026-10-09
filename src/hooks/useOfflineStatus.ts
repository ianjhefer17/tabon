import { useEffect, useState } from 'react'
import { isModelCached } from '../lib/llmPii'
import type { LlmState } from './useLlm'

export interface OfflineStatus {
  online: boolean
  /** Tesseract worker, core and language data are in the service worker's precache. */
  ocrCached: boolean
  /** The loaded AI model is stored on this device (false when WebGPU is unavailable). */
  modelCached: boolean
}

// Files OCR can't run without. Precache keys carry a ?__WB_REVISION__ param, hence ignoreSearch.
const OCR_FILES = ['tesseract/worker.min.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js', 'tesseract/lang/eng.traineddata.gz']

async function checkOcrCached(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return false
  // Resolves once a service worker is active, i.e. its precache install has finished.
  await navigator.serviceWorker.ready
  const base = new URL(import.meta.env.BASE_URL, window.location.href)
  const hits = await Promise.all(OCR_FILES.map((f) => caches.match(new URL(f, base).href, { ignoreSearch: true })))
  return hits.every(Boolean)
}

export function useOfflineStatus(llm: LlmState): OfflineStatus {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [ocrCached, setOcrCached] = useState(false)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    checkOcrCached()
      .then((ok) => !cancelled && setOcrCached(ok))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Set when a freshly downloaded model has been confirmed in storage, keyed by model id.
  const [checkedModel, setCheckedModel] = useState<string | null>(null)
  const loaded = llm.status === 'ready' && llm.modelId !== null
  // Loaded from this device's storage means it's cached; only a fresh download needs checking.
  const fromCache = loaded && llm.progress?.fromCache === true

  useEffect(() => {
    if (!loaded || fromCache || !llm.modelId) return
    let cancelled = false
    const id = llm.modelId
    isModelCached(id).then((ok) => !cancelled && ok && setCheckedModel(id))
    return () => {
      cancelled = true
    }
  }, [loaded, fromCache, llm.modelId])

  const modelCached = loaded && (fromCache || checkedModel === llm.modelId)

  return { online, ocrCached, modelCached }
}
