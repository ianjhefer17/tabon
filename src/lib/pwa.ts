import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

// Caches the app, OCR and PDF assets for offline use.
// When a newly deployed version takes control, we must reload to run it. Reloading while a
// document is open would wipe the user's work, so the app decides when (see App.tsx).
let updateReady = false
const listeners = new Set<() => void>()

export function startPwa() {
  registerSW({
    immediate: true,
    onNeedReload() {
      updateReady = true
      listeners.forEach((l) => l())
    },
  })
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => updateReady,
  )
}
