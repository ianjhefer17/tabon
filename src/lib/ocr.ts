import { createWorker, type PSM, type Worker } from 'tesseract.js'
import { detectRegex } from './regexPii'
import type { Word } from '../types'
import { ocrScale, sourceSize, type ImageSource } from './image'

export interface OcrResult {
  words: Word[]
  fullText: string
  /** Original image size; word bboxes are in this coordinate space. */
  width: number
  height: number
}

export type OcrProgress = (percent: number, status: string) => void

export type OcrSource = ImageSource

/** Preprocessing and segmentation settings. DEFAULT_TUNING is what the app uses. */
export interface OcrTuning {
  /** Upscale so the image is at least this wide. Huge images are downscaled instead (see ocrScale). */
  minWidth: number
  /** Gray level 0-255 to binarize at before OCR, or null to let Tesseract threshold. */
  binarize: number | null
  /** Tesseract page segmentation mode: '3' = automatic layout, '6' = single uniform block. */
  psm: '3' | '6'
}

// Chosen on the 4 samples + 3 simulated phone photos (shadow, blur, tilt, low-res), 31 key PII values:
//   PSM 6: 31/31 · PSM 3 (auto): 30/31 · 2.5x upscale: 30/31 at 2x the time ·
//   fixed binarize @128: 28/31, @160: 24/31 (fails on shadowed photos; Sauvola already adapts).
export const DEFAULT_TUNING: OcrTuning = { minWidth: 2000, binarize: null, psm: '6' }

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

/** Draws the image at OCR size (see ocrScale), in grayscale, optionally binarized. */
function preprocess(src: OcrSource, width: number, height: number, tuning: OcrTuning): { canvas: HTMLCanvasElement; scale: number } {
  const scale = ocrScale(width, height, tuning.minWidth)
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
    d[i] = d[i + 1] = d[i + 2] = tuning.binarize === null ? y : y < tuning.binarize ? 0 : 255
  }
  ctx.putImageData(img, 0, 0)
  return { canvas, scale }
}

export function runOcr(src: OcrSource, onProgress?: OcrProgress, tuning: OcrTuning = DEFAULT_TUNING): Promise<OcrResult> {
  const run = queue.then(() => recognizeImage(src, tuning, onProgress))
  queue = run.catch(() => undefined)
  return run
}

async function recognizeImage(src: OcrSource, tuning: OcrTuning, onProgress?: OcrProgress): Promise<OcrResult> {
  const { width, height } = sourceSize(src)
  currentProgress = onProgress
  lastPercent = 0
  onProgress?.(0, 'preparing image')
  try {
    const worker = await getWorker()
    await worker.setParameters({ tessedit_pageseg_mode: tuning.psm as PSM })
    const { canvas, scale } = preprocess(src, width, height, tuning)
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
    let result = toWordsAndText(data, scale)

    // Passports: single-block reading (PSM 6) runs each row across the photo and hologram, which
    // garbles the printed name fields. When a machine-readable zone shows this is a passport, read
    // again with automatic layout (PSM 3), which keeps the name column separate.
    if (tuning.psm === '6' && hasMrz(result.fullText)) {
      onProgress?.(99, 'reading passport layout')
      await worker.setParameters({ tessedit_pageseg_mode: '3' as PSM })
      const second = await worker.recognize(canvas, {}, { blocks: true, text: false })
      const auto = toWordsAndText(second.data, scale)
      // Automatic layout can drop small isolated fields (the passport number in the corner), so
      // keep the single-block lines holding a detection the second reading doesn't have.
      if (hasMrz(auto.fullText)) result = withMissingLines(auto, result)
    }

    onProgress?.(100, 'done')
    return { ...result, width, height }
  } finally {
    currentProgress = undefined
  }
}

/** A line that looks like a passport MRZ: long, mostly A-Z/0-9/<, with a "<<" filler. */
export function hasMrz(fullText: string): boolean {
  return fullText.split('\n').some((line) => {
    const c = line.replace(/\s+/g, '')
    return c.length >= 25 && /[<«]{2}/.test(c) && c.replace(/[^A-Z0-9<«]/g, '').length >= c.length * 0.85
  })
}

type RecognizeData = Awaited<ReturnType<Worker['recognize']>>['data']

/** Flattens Tesseract blocks into words (in original image pixels) and '\n'-separated lines. */
function toWordsAndText(data: RecognizeData, scale: number): { words: Word[]; fullText: string } {
  const words: Word[] = []
  let fullText = ''
  let lineCount = 0
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const lineWords = line.words.filter((w) => w.text.trim() !== '')
        if (lineWords.length === 0) continue
        if (fullText) fullText += '\n'
        const lineIndex = lineCount++
        lineWords.forEach((w, i) => {
          if (i > 0) fullText += ' '
          const text = w.text.trim()
          const charStart = fullText.length
          fullText += text
          words.push({
            text,
            charStart,
            charEnd: fullText.length,
            line: lineIndex,
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
  return { words, fullText }
}

/** `base` plus the lines of `other` that hold a rule detection whose text `base` lacks. */
function withMissingLines(base: { words: Word[]; fullText: string }, other: { words: Word[]; fullText: string }) {
  const flat = base.fullText.replace(/\s+/g, '')
  const lines = new Set<number>()
  for (const span of detectRegex(other.fullText)) {
    if (flat.includes(span.text.replace(/\s+/g, ''))) continue
    for (const w of other.words) if (w.charStart < span.end && span.start < w.charEnd) lines.add(w.line)
  }
  const words = [...base.words]
  let fullText = base.fullText
  let line = words.length ? words[words.length - 1].line + 1 : 0
  for (const n of [...lines].sort((a, b) => a - b)) {
    const lineWords = other.words.filter((w) => w.line === n)
    if (fullText) fullText += '\n'
    lineWords.forEach((w, i) => {
      if (i > 0) fullText += ' '
      const charStart = fullText.length
      fullText += w.text
      words.push({ ...w, charStart, charEnd: fullText.length, line })
    })
    line++
  }
  return { words, fullText }
}
