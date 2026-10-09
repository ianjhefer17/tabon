import { SOURCE_LABEL, TYPE_COLOR, TYPE_LABEL, maskText } from '../lib/piiStyle'
import type { Box } from '../types'

export type PanelPhase = 'empty' | 'reading' | 'done'

interface SidePanelProps {
  phase: PanelPhase
  boxes: Box[]
  onToggle: (group: string) => void
  onSetAll: (enabled: boolean) => void
  /** TEMP debug: remove before submission. */
  showOcr: boolean
  onShowOcrChange: (show: boolean) => void
  fullText: string
}

interface Detection {
  group: string
  box: Box
  enabled: boolean
}

/** One entry per detection (a span may have several boxes, one per line). */
function detections(boxes: Box[]): Detection[] {
  const byGroup = new Map<string, Detection>()
  for (const b of boxes) {
    const d = byGroup.get(b.group)
    if (d) d.enabled = d.enabled && b.enabled
    else byGroup.set(b.group, { group: b.group, box: b, enabled: b.enabled })
  }
  return [...byGroup.values()]
}

export function SidePanel({ phase, boxes, onToggle, onSetAll, showOcr, onShowOcrChange, fullText }: SidePanelProps) {
  const items = detections(boxes)
  const selected = items.filter((d) => d.enabled).length

  return (
    <aside className="w-full border-t border-gray-800 p-4 md:w-80 md:border-t-0 md:border-l">
      <h2 className="text-sm font-semibold tracking-wide text-gray-300 uppercase">Detected info</h2>

      {phase === 'empty' && <p className="mt-3 text-sm text-gray-500">No document loaded yet.</p>}
      {phase === 'reading' && <p className="mt-3 text-sm text-gray-500">Reading the document…</p>}
      {phase === 'done' && items.length === 0 && (
        <p className="mt-3 text-sm text-gray-400">No personal info found by the rules. Check the document yourself before sharing.</p>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-400">
              {selected} of {items.length} selected for redaction
            </p>
            <div className="flex gap-1 whitespace-nowrap">
              <button type="button" onClick={() => onSetAll(true)} className="rounded border border-gray-700 px-2 py-0.5 text-xs hover:border-gray-500">
                Select all
              </button>
              <button type="button" onClick={() => onSetAll(false)} className="rounded border border-gray-700 px-2 py-0.5 text-xs hover:border-gray-500">
                Clear all
              </button>
            </div>
          </div>
          <ul className="mt-3 space-y-1">
            {items.map(({ group, box, enabled }) => (
              <li key={group}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-900">
                  <input type="checkbox" checked={enabled} onChange={() => onToggle(group)} className="shrink-0" />
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: `${TYPE_COLOR[box.type]}33`, color: TYPE_COLOR[box.type] }}
                  >
                    {TYPE_LABEL[box.type]}
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-mono text-xs ${enabled ? 'text-gray-200' : 'text-gray-500 line-through'}`}>
                    {maskText(box.text)}
                  </span>
                  <span className="shrink-0 text-[11px] text-gray-500">{SOURCE_LABEL[box.source]}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-6 text-xs text-amber-400">Review before sharing.</p>

      {/* TEMP debug: remove before submission. */}
      <label className="mt-6 flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={showOcr} onChange={(e) => onShowOcrChange(e.target.checked)} />
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
