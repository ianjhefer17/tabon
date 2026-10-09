import type { Box } from '../types'

// TODO: draw enabled boxes as solid black on a full-res canvas and export PNG.
export async function exportRedactedPng(_source: HTMLCanvasElement, _boxes: Box[]): Promise<Blob> {
  return new Blob([], { type: 'image/png' })
}
