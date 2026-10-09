import { useEffect, useRef } from 'react'

interface ExportModalProps {
  url: string
  fileName: string
  onDownload: () => void
  onCopy: () => void
  copyStatus: string
  onClose: () => void
}

// Shown after export: the redacted image exactly as saved, so the user can check it.
export function ExportModal({ url, fileName, onDownload, onCopy, copyStatus, onClose }: ExportModalProps) {
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
        aria-labelledby="export-title"
        className="flex max-h-full w-full max-w-3xl flex-col rounded-lg border border-gray-700 bg-gray-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="export-title" className="text-base font-semibold text-gray-100">
              Saved {fileName}
            </h2>
            <p className="mt-1 text-sm font-medium text-amber-400">Review before sharing. Check that every personal detail is covered.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-md border border-gray-700 px-3 py-1 text-sm hover:border-gray-500">
            Close
          </button>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-gray-800 bg-white">
          <img src={url} alt="Redacted document" className="block h-auto w-full" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onDownload} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-emerald-400">
            Download again
          </button>
          <button type="button" onClick={onCopy} className="rounded-md border border-gray-700 px-4 py-2 text-sm hover:border-gray-500">
            Copy to clipboard
          </button>
          {copyStatus && <span className="text-xs text-gray-400">{copyStatus}</span>}
          <span className="ml-auto text-xs text-gray-500">Metadata (EXIF/GPS) removed</span>
        </div>
      </div>
    </div>
  )
}
