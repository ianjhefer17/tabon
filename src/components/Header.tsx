import type { OfflineStatus } from '../hooks/useOfflineStatus'

interface HeaderProps {
  offline: OfflineStatus
  /** False when the browser has no WebGPU, so there is no model to cache. */
  aiAvailable: boolean
  onPrivacy: () => void
}

export function Header({ offline, aiAvailable, onPrivacy }: HeaderProps) {
  const ready = offline.ocrCached && (offline.modelCached || !aiAvailable)
  const label = ready ? `Offline-ready${aiAvailable ? '' : ' (rules only)'} · 0 bytes sent` : 'Saving for offline use…'
  const title = ready
    ? 'The app, OCR and AI model are stored on this device. Your documents are never uploaded.'
    : 'Downloading the app, OCR and AI model to this device. Your documents are never uploaded.'

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-6 py-4">
      <h1 className="text-xl font-semibold">Tabon — redact before you share</h1>
      <div className="flex items-center gap-3 text-xs">
        <span
          title={title}
          className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
            ready ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-gray-700 bg-gray-900 text-gray-400'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${ready ? 'bg-emerald-400' : 'bg-gray-500'}`} aria-hidden="true" />
          {label}
          <span className="text-gray-500">|</span>
          <span className={offline.online ? 'text-gray-300' : 'font-semibold text-gray-100'}>{offline.online ? 'Online' : 'Offline'}</span>
        </span>
        <button type="button" onClick={onPrivacy} className="text-gray-300 underline underline-offset-2 hover:text-white">
          Privacy
        </button>
      </div>
    </header>
  )
}
