import type { Span } from '../types'

export const PRIMARY_MODEL = 'Qwen2.5-3B-Instruct-q4f16_1-MLC'
export const FALLBACK_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

export type LoadProgress = (progress: number, text: string) => void

// TODO: load WebLLM in a Web Worker.
export async function loadLlm(_onProgress?: LoadProgress): Promise<void> {}

// TODO: ask the LLM for exact PII substrings and map them back to spans.
export async function detectLlmPii(_text: string): Promise<Span[]> {
  return []
}
