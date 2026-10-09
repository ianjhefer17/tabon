import { useCallback, useEffect, useState } from 'react'
import { checkWebGPU, getSavedModel, loadLlm, saveModel, type LoadProgress, type ModelKey } from '../lib/llmPii'

export type LlmStatus = 'checking' | 'unsupported' | 'loading' | 'ready' | 'error'

export interface LlmState {
  status: LlmStatus
  progress: LoadProgress | null
  modelKey: ModelKey
  /** Model id actually loaded (may be the q4f32 build on GPUs without f16). */
  modelId: string | null
  error: string | null
  setModelKey: (key: ModelKey) => void
}

/** Checks WebGPU and loads the chosen model in the background as soon as the app opens. */
export function useLlm(): LlmState {
  const [status, setStatus] = useState<LlmStatus>('checking')
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [modelKey, setKey] = useState<ModelKey>(getSavedModel)
  const [modelId, setModelId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const gpu = await checkWebGPU()
      if (cancelled) return
      if (!gpu.ok) {
        console.info('WebGPU unavailable:', gpu.reason)
        setStatus('unsupported')
        return
      }
      setStatus('loading')
      setProgress(null)
      try {
        const id = await loadLlm(modelKey, gpu.f16, (p) => !cancelled && setProgress(p))
        if (cancelled) return
        setModelId(id)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        console.error(err)
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [modelKey])

  const setModelKey = useCallback((key: ModelKey) => {
    saveModel(key)
    setKey(key)
    // Not 'ready' until the new model has loaded, so no scan starts on the old one.
    setStatus((s) => (s === 'unsupported' ? s : 'loading'))
    setProgress(null)
  }, [])

  return { status, progress, modelKey, modelId, error, setModelKey }
}
