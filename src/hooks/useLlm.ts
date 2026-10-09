import { useCallback, useEffect, useState } from 'react'
import { checkWebGPU, getSavedModel, loadLlm, saveModel, type LoadProgress, type ModelKey } from '../lib/llmPii'

/** 'paused': WebGPU works, but this is a phone, so the model waits for the user to opt in. */
export type LlmStatus = 'checking' | 'unsupported' | 'paused' | 'loading' | 'ready' | 'error'

export interface LlmState {
  status: LlmStatus
  progress: LoadProgress | null
  modelKey: ModelKey
  /** Model id actually loaded (may be the q4f32 build on GPUs without f16). */
  modelId: string | null
  error: string | null
  /** The load failed for lack of network: the model was never fully saved on this device. */
  needsNetwork: boolean
  setModelKey: (key: ModelKey) => void
  /** Opt in on a phone: loads the Lite model for this visit only. */
  enableAi: () => void
}

/**
 * Checks WebGPU and loads the chosen model in the background as soon as the app opens.
 * Phones are the exception: iOS 26 exposes WebGPU, but loading a 1-2 GB model gets the tab
 * killed for memory ("Can't open this page"), so phones start rules-only and load Lite on request.
 */
export function useLlm(): LlmState {
  const [status, setStatus] = useState<LlmStatus>('checking')
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [modelKey, setKey] = useState<ModelKey>(getSavedModel)
  const [modelId, setModelId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsNetwork, setNeedsNetwork] = useState(false)
  // Bumped to retry a load that failed offline once the connection is back.
  const [attempt, setAttempt] = useState(0)
  // Not persisted: if the model crashes the tab, the next visit starts rules-only again.
  const [optIn, setOptIn] = useState(false)

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
      if (isPhone() && !optIn) {
        setStatus('paused')
        return
      }
      setStatus('loading')
      setProgress(null)
      setError(null)
      setNeedsNetwork(false)
      try {
        const id = await loadLlm(modelKey, gpu.f16, (p) => !cancelled && setProgress(p))
        if (cancelled) return
        setModelId(id)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        console.error(err)
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setNeedsNetwork(!navigator.onLine || /failed to fetch|network/i.test(message))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [modelKey, attempt, optIn])

  useEffect(() => {
    if (!(status === 'error' && needsNetwork)) return
    const retry = () => setAttempt((n) => n + 1)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [status, needsNetwork])

  const setModelKey = useCallback((key: ModelKey) => {
    saveModel(key)
    setKey(key)
    // Not 'ready' until the new model has loaded, so no scan starts on the old one.
    setStatus((s) => (s === 'unsupported' || s === 'paused' ? s : 'loading'))
    setProgress(null)
  }, [])

  const enableAi = useCallback(() => {
    saveModel('lite')
    setKey('lite')
    setOptIn(true)
  }, [])

  return { status, progress, modelKey, modelId, error, needsNetwork, setModelKey, enableAi }
}

/** Phones and tablets (iPadOS reports itself as a Mac, so also check for touch). */
function isPhone(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
