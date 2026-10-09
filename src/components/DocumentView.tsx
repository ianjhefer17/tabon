import { useEffect, useRef } from 'react'
import type { Word } from '../types'

interface DocumentViewProps {
  src: string
  width: number
  height: number
  words: Word[]
}

// Image with a same-size canvas overlay; the canvas uses original image coordinates and is scaled by CSS.
export function DocumentView({ src, width, height, words }: DocumentViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = 'rgba(107, 114, 128, 0.9)'
    ctx.lineWidth = Math.max(1, width / 1000)
    for (const { bbox } of words) {
      ctx.strokeRect(bbox.x0, bbox.y0, bbox.x1 - bbox.x0, bbox.y1 - bbox.y0)
    }
  }, [words, width, height])

  return (
    <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-gray-800 bg-white">
      <img src={src} alt="Loaded document" className="block h-auto w-full" />
      <canvas ref={canvasRef} width={width} height={height} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  )
}
