import type { Word } from '../types'

export interface OcrResult {
  words: Word[]
  fullText: string
}

// TODO: Tesseract.js with self-hosted worker/core/lang data under /public.
export async function runOcr(_image: HTMLCanvasElement): Promise<OcrResult> {
  return { words: [], fullText: '' }
}
