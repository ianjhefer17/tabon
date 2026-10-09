import { GlobalWorkerOptions, PasswordException, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'

// pdf.js worker and data are self-hosted under /public/pdfjs (see scripts/copy-assets.mjs).
const PDFJS_BASE = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href
GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`

const TARGET_WIDTH = 2000
const MAX_SCALE = 4

export interface PdfDoc {
  numPages: number
  /** Renders a page (1-based) on a white canvas at least TARGET_WIDTH px wide. */
  renderPage(pageNumber: number): Promise<HTMLCanvasElement>
  destroy(): Promise<void>
}

export async function openPdf(file: File): Promise<PdfDoc> {
  let pdf: PDFDocumentProxy
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${PDFJS_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
    wasmUrl: `${PDFJS_BASE}wasm/`,
    iccUrl: `${PDFJS_BASE}iccs/`,
    enableXfa: false,
  })
  try {
    pdf = await task.promise
  } catch (err) {
    task.destroy().catch(() => undefined)
    if (err instanceof PasswordException) throw new Error('Password-protected PDFs are not supported.')
    throw err
  }

  return {
    numPages: pdf.numPages,
    async renderPage(pageNumber) {
      const page = await pdf.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(MAX_SCALE, Math.max(1, TARGET_WIDTH / base.width))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      page.cleanup()
      return canvas
    },
    destroy: () => task.destroy(),
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode page image'))), 'image/png'),
  )
}
