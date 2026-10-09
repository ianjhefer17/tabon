import { createWorker, type Worker } from 'tesseract.js'
import type { Word } from '../types'

export interface OcrResult {
  words: Word[]
  fullText: string
  /** Original image size; word bboxes are in this coordinate space. */
  width: number
  height: number
}

export type OcrProgress = (percent: number, status: string) => void

export type OcrSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap

const MIN_OCR_WIDTH = 2000

// All Tesseract assets are self-hosted under /public/tesseract (see scripts/copy-assets.mjs).
// Absolute URLs because the worker resolves paths relative to its own script.
const TESS_BASE = new URL(`${import.meta.env.BASE_URL}tesseract/`, window.location.href).href

let workerPromise: Promise<Worker> | null = null
let currentProgress: OcrProgress | undefined
// Runs are serialized so progress events always belong to the active run.
let queue: Promise<unknown> = Promise.resolve()

// Tesseract statuses mapped onto one 0-100 bar: setup steps share 0-20, recognition takes 20-100.
const STAGES: Record<string, [number, number]> = {
  'loading tesseract core': [0, 5],
  'initializing tesseract': [5, 8],
  'loading language traineddata': [8, 16],
  'initializing api': [16, 20],
  'recognizing text': [20, 100],
}
let lastPercent = 0

function reportProgress(status: string, progress: number) {
  const stage = STAGES[status]
  if (!currentProgress || !stage) return
  const p = Math.max(0, Math.min(1, progress))
  const percent = Math.round(stage[0] + p * (stage[1] - stage[0]))
  if (percent < lastPercent) return
  lastPercent = percent
  currentProgress(percent, status)
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: `${TESS_BASE}worker.min.js`,
      corePath: `${TESS_BASE}core/`,
      langPath: `${TESS_BASE}lang`,
      gzip: true,
      workerBlobURL: false,
      logger: (m) => reportProgress(m.status, m.progress),
    })
      .then(async (worker) => {
        // Sauvola adaptive thresholding: reads dark text on coloured bands that the default (Otsu) drops.
        // kfactor 0.2 found every key PII string in all 4 samples; the 0.34 default misread a date.
        await worker.setParameters({ thresholding_method: '2', thresholding_kfactor: '0.2' })
        return worker
      })
      .catch((err) => {
        workerPromise = null
        throw err
      })
  }
  return workerPromise
}

function sourceSize(src: OcrSource): { width: number; height: number } {
  if (src instanceof HTMLImageElement) return { width: src.naturalWidth, height: src.naturalHeight }
  return { width: src.width, height: src.height }
}

/** Draws the image upscaled to at least MIN_OCR_WIDTH and converted to grayscale. */
function preprocess(src: OcrSource, width: number, height: number): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.max(1, MIN_OCR_WIDTH / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D context not available')
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff' // flatten transparency onto white
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = y
  }
  ctx.putImageData(img, 0, 0)
  return { canvas, scale }
}

export function runOcr(src: OcrSource, onProgress?: OcrProgress): Promise<OcrResult> {
  const run = queue.then(() => recognizeImage(src, onProgress))
  queue = run.catch(() => undefined)
  return run
}

async function recognizeImage(src: OcrSource, onProgress?: OcrProgress): Promise<OcrResult> {
  const { width, height } = sourceSize(src)
  currentProgress = onProgress
  lastPercent = 0
  onProgress?.(0, 'preparing image')
  try {
    const worker = await getWorker()
    const { canvas, scale } = preprocess(src, width, height)
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })

    const words: Word[] = []
    let fullText = ''
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const lineWords = line.words.filter((w) => w.text.trim() !== '')
          if (lineWords.length === 0) continue
          if (fullText) fullText += '\n'
          lineWords.forEach((w, i) => {
            if (i > 0) fullText += ' '
            const text = w.text.trim()
            const charStart = fullText.length
            fullText += text
            words.push({
              text,
              charStart,
              charEnd: fullText.length,
              bbox: {
                x0: w.bbox.x0 / scale,
                y0: w.bbox.y0 / scale,
                x1: w.bbox.x1 / scale,
                y1: w.bbox.y1 / scale,
              },
            })
          })
        }
      }
    }

    onProgress?.(100, 'done')
    return { words, fullText, width, height }
  } finally {
    currentProgress = undefined
  }
}
