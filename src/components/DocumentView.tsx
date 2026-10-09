import { useEffect, useRef } from 'react'
import { TYPE_COLOR, TYPE_LABEL } from '../lib/piiStyle'
import type { Box, Word } from '../types'

interface DocumentViewProps {
  src: string
  width: number
  height: number
  words: Word[]
  boxes: Box[]
  /** Debug: outline every OCR word. */
  showWords: boolean
  onToggle: (group: string) => void
}

// The image with two overlays in original image coordinates, scaled by CSS:
// a canvas for (debug) word outlines and an SVG of clickable detection boxes.
export function DocumentView({ src, width, height, words, boxes, showWords, onToggle }: DocumentViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (!showWords) return
    ctx.strokeStyle = 'rgba(107, 114, 128, 0.9)'
    ctx.lineWidth = Math.max(1, width / 1000)
    for (const { bbox } of words) {
      ctx.strokeRect(bbox.x0, bbox.y0, bbox.x1 - bbox.x0, bbox.y1 - bbox.y0)
    }
  }, [words, width, height, showWords])

  return (
    <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-gray-800 bg-white">
      <img src={src} alt="Loaded document" className="block h-auto w-full" />
      <canvas ref={canvasRef} width={width} height={height} className="pointer-events-none absolute inset-0 h-full w-full" />
      <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" aria-label="Detected personal information">
        {boxes.map((b) => {
          const color = TYPE_COLOR[b.type]
          const label = `${TYPE_LABEL[b.type]} — ${b.enabled ? 'will be redacted' : 'kept'}. Click to toggle.`
          return (
            <rect
              key={b.id}
              x={b.bbox.x0}
              y={b.bbox.y0}
              width={b.bbox.x1 - b.bbox.x0}
              height={b.bbox.y1 - b.bbox.y0}
              rx={3}
              fill={color}
              fillOpacity={b.enabled ? 0.3 : 0}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={b.enabled ? undefined : '6 4'}
              vectorEffect="non-scaling-stroke"
              role="checkbox"
              aria-checked={b.enabled}
              aria-label={label}
              tabIndex={0}
              className="cursor-pointer outline-none focus-visible:stroke-[4px]"
              onClick={() => onToggle(b.group)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle(b.group)
                }
              }}
            >
              <title>{label}</title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}
