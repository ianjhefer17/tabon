import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { TYPE_COLOR, TYPE_LABEL } from '../lib/piiStyle'
import type { BBox, Box, Word } from '../types'

interface DocumentViewProps {
  src: string
  width: number
  height: number
  words: Word[]
  boxes: Box[]
  /** Debug: outline every OCR word. */
  showWords: boolean
  onToggle: (group: string) => void
  /** Draw mode: dragging on the image adds a box instead of toggling boxes. */
  drawing: boolean
  onDraw: (bbox: BBox) => void
}

/** Drags smaller than this (image pixels) are treated as accidental clicks. */
const MIN_DRAW = 6

function normalize(a: { x: number; y: number }, b: { x: number; y: number }): BBox {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }
}

// The image with two overlays in original image coordinates, scaled by CSS:
// a canvas for (debug) word outlines and an SVG of clickable detection boxes.
export function DocumentView({ src, width, height, words, boxes, showWords, onToggle, drawing, onDraw }: DocumentViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null)

  // Pointer position in original image coordinates, clamped to the image.
  const toImage = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * width
    const y = ((e.clientY - r.top) / r.height) * height
    return { x: Math.min(width, Math.max(0, x)), y: Math.min(height, Math.max(0, y)) }
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!drawing || e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toImage(e)
    setDragStart(p)
    setDragEnd(p)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragStart) setDragEnd(toImage(e))
  }
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragStart) return
    const bbox = normalize(dragStart, toImage(e))
    setDragStart(null)
    setDragEnd(null)
    if (bbox.x1 - bbox.x0 >= MIN_DRAW && bbox.y1 - bbox.y0 >= MIN_DRAW) onDraw(bbox)
  }
  const onPointerCancel = () => {
    setDragStart(null)
    setDragEnd(null)
  }
  const draft = dragStart && dragEnd ? normalize(dragStart, dragEnd) : null

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
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`absolute inset-0 h-full w-full ${drawing ? 'cursor-crosshair touch-none' : ''}`}
        aria-label="Detected personal information"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
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
              className={`outline-none focus-visible:stroke-[4px] ${drawing ? 'pointer-events-none' : 'cursor-pointer'}`}
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
        {draft && (
          <rect
            x={draft.x0}
            y={draft.y0}
            width={draft.x1 - draft.x0}
            height={draft.y1 - draft.y0}
            fill="#000"
            fillOpacity={0.35}
            stroke="#f9fafb"
            strokeWidth={2}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  )
}
