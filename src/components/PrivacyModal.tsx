import { useEffect, useRef } from 'react'

interface PrivacyModalProps {
  onClose: () => void
}

// Plain-language explanation of where the user's document goes (nowhere) and how to check.
export function PrivacyModal({ onClose }: PrivacyModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        className="max-h-full w-full max-w-xl overflow-auto rounded-lg border border-gray-700 bg-gray-900 p-5 text-sm text-gray-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="privacy-title" className="text-base font-semibold text-gray-100">
            Privacy
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-md border border-gray-700 px-3 py-1 text-sm hover:border-gray-500">
            Close
          </button>
        </div>

        <h3 className="mt-4 font-semibold text-gray-100">Everything runs on this device</h3>
        <p className="mt-1">
          Reading the text (OCR) and finding personal details (the AI model) both happen inside your browser, using your own computer's processor and
          graphics chip. There is no Tabon server.
        </p>

        <h3 className="mt-4 font-semibold text-gray-100">Nothing is uploaded</h3>
        <p className="mt-1">
          Your document, its text and the redacted image never leave this device. Tabon has no accounts, no analytics and no trackers. The redacted image is
          saved straight to your downloads.
        </p>

        <h3 className="mt-4 font-semibold text-gray-100">What is downloaded, once</h3>
        <p className="mt-1">
          On your first visit the browser downloads the app, the OCR files and the AI model (about 1–2 GB) and keeps them. After that Tabon works with Wi-Fi
          off.
        </p>

        <h3 className="mt-4 font-semibold text-gray-100">Check it yourself</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Open DevTools (<kbd className="rounded bg-gray-800 px-1">F12</kbd>, or <kbd className="rounded bg-gray-800 px-1">⌥⌘I</kbd> on a Mac) and go to
            the <span className="font-medium text-gray-100">Network</span> tab.
          </li>
          <li>Redact a document. No request carries your file; the only entries are the app's own files, served from this device's cache.</li>
          <li>
            Or turn Wi-Fi off (or tick <span className="font-medium text-gray-100">Offline</span> in the Network tab), reload, and redact a document. It
            still works.
          </li>
        </ol>

        <p className="mt-4 font-medium text-amber-400">Review before sharing: the detector can miss things, so check every redacted image.</p>
      </div>
    </div>
  )
}
