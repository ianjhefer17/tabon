import { useState } from 'react'
import type { Box } from '../types'

interface SidePanelProps {
  boxes: Box[]
  /** OCR text of the current page, for the temporary debug view. */
  fullText: string
}

export function SidePanel({ boxes, fullText }: SidePanelProps) {
  const [showOcr, setShowOcr] = useState(false)

  return (
    <aside className="w-full border-t border-gray-800 p-4 md:w-80 md:border-t-0 md:border-l">
      <h2 className="text-sm font-semibold tracking-wide text-gray-300 uppercase">Detected info</h2>
      {boxes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No document loaded yet.</p>
      ) : (
        <p className="mt-3 text-sm">{boxes.length} items</p>
      )}
      <p className="mt-6 text-xs text-amber-400">Review before sharing.</p>

      {/* TEMP debug: remove before submission. */}
      <label className="mt-6 flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={showOcr} onChange={(e) => setShowOcr(e.target.checked)} />
        Show OCR text
      </label>
      {showOcr && (
        <pre data-testid="ocr-text" className="mt-2 max-h-96 overflow-auto rounded-md bg-gray-900 p-2 text-xs whitespace-pre-wrap text-gray-300">
          {fullText || '(no OCR text yet)'}
        </pre>
      )}
    </aside>
  )
}
