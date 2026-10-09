import type { Box } from '../types'

interface SidePanelProps {
  boxes: Box[]
}

export function SidePanel({ boxes }: SidePanelProps) {
  return (
    <aside className="w-full border-t border-gray-800 p-4 md:w-80 md:border-t-0 md:border-l">
      <h2 className="text-sm font-semibold tracking-wide text-gray-300 uppercase">Detected info</h2>
      {boxes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No document loaded yet.</p>
      ) : (
        <p className="mt-3 text-sm">{boxes.length} items</p>
      )}
      <p className="mt-6 text-xs text-amber-400">Review before sharing.</p>
    </aside>
  )
}
