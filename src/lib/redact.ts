import type { BBox, Box } from '../types'
import { sourceSize, type ImageSource } from './image'

export type RedactStyle = 'black' | 'pixelate'

/** Extra pixels (original image coordinates) added on every side of a box. */
const PADDING = 4
/** Smallest pixelate block. Large enough that the letters cannot be read back. */
const MIN_BLOCK = 16

function padded(b: BBox, width: number, height: number) {
  const x0 = Math.max(0, Math.floor(b.x0 - PADDING))
  const y0 = Math.max(0, Math.floor(b.y0 - PADDING))
  const x1 = Math.min(width, Math.ceil(b.x1 + PADDING))
  const y1 = Math.min(height, Math.ceil(b.y1 + PADDING))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Replaces each block of the region with its average colour. */
function pixelate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // Scale blocks with the text height so a box is at most ~2 blocks tall.
  const block = Math.max(MIN_BLOCK, Math.ceil(h / 2))
  const img = ctx.getImageData(x, y, w, h)
  const d = img.data
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const bw = Math.min(block, w - bx)
      const bh = Math.min(block, h - by)
      let r = 0
      let g = 0
      let b = 0
      for (let yy = by; yy < by + bh; yy++) {
        for (let xx = bx; xx < bx + bw; xx++) {
          const i = (yy * w + xx) * 4
          r += d[i]
          g += d[i + 1]
          b += d[i + 2]
        }
      }
      const n = bw * bh
      ctx.fillStyle = `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`
      ctx.fillRect(x + bx, y + by, bw, bh)
    }
  }
}

/**
 * Draws the original image at full resolution and covers every enabled box.
 * Only pixels end up in the canvas, so the PNG made from it carries no EXIF/GPS metadata.
 */
export function redactImage(original: ImageSource, boxes: Box[], style: RedactStyle = 'black'): HTMLCanvasElement {
  const { width, height } = sourceSize(original)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: style === 'pixelate' })
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(original, 0, 0, width, height)
  for (const box of boxes) {
    if (!box.enabled) continue
    const { x, y, w, h } = padded(box.bbox, width, height)
    if (w <= 0 || h <= 0) continue
    if (style === 'pixelate') {
      pixelate(ctx, x, y, w, h)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(x, y, w, h)
    }
  }
  return canvas
}

export function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode PNG'))), 'image/png'),
  )
}

/** "payslip.jpg" → "payslip-redacted.png"; PDF pages get "-page2" when there are several. */
export function redactedFileName(name: string, page?: number, numPages?: number): string {
  const base = name.replace(/\.[^./]+$/, '') || 'document'
  const pageTag = page && numPages && numPages > 1 ? `-page${page}` : ''
  return `${base}${pageTag}-redacted.png`
}

/** "statement.pdf" → "statement-redacted.pdf". */
export function redactedPdfName(name: string): string {
  return `${name.replace(/\.[^./]+$/, '') || 'document'}-redacted.pdf`
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Copies a PNG to the clipboard. Takes a promise so the ClipboardItem is created inside the click
 * handler (Safari rejects clipboard writes that start after an await).
 */
export async function copyPng(blob: Promise<Blob>): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Copying images is not supported in this browser')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
