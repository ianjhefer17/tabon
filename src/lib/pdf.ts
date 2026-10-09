import { GlobalWorkerOptions, PasswordException, getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'

// pdf.js worker and data are self-hosted under /public/pdfjs (see scripts/copy-assets.mjs).
const PDFJS_BASE = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href
GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`

/** Page render scale: 2 canvas pixels per PDF point (144 dpi). */
export const PAGE_SCALE = 2
/** Thumbnail width in CSS pixels (rendered at 2x for sharp display). */
const THUMB_WIDTH = 96

export interface PdfDoc {
  numPages: number
  /** Renders a page (1-based) on a white canvas at PAGE_SCALE. */
  renderPage(pageNumber: number): Promise<HTMLCanvasElement>
  /** Renders a small preview of a page (1-based). */
  renderThumb(pageNumber: number): Promise<HTMLCanvasElement>
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

  const render = async (pageNumber: number, scaleFor: (pointWidth: number) => number) => {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: scaleFor(page.getViewport({ scale: 1 }).width) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    await page.render({ canvas, viewport, background: '#ffffff' }).promise
    page.cleanup()
    return canvas
  }

  return {
    numPages: pdf.numPages,
    renderPage: (n) => render(n, () => PAGE_SCALE),
    renderThumb: (n) => render(n, (w) => (THUMB_WIDTH * 2) / w),
    destroy: () => task.destroy(),
  }
}

/**
 * Builds a PDF with one page per PNG, each page sized to its image at PAGE_SCALE.
 * The pages are images only: no text layer, links, forms or metadata from the original survive.
 */
export async function imagesToPdf(pngs: Blob[]): Promise<Blob> {
  const out = await PDFDocument.create()
  out.setProducer('Tabon')
  out.setCreator('Tabon')
  for (const png of pngs) {
    const img = await out.embedPng(new Uint8Array(await png.arrayBuffer()))
    const w = img.width / PAGE_SCALE
    const h = img.height / PAGE_SCALE
    out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h })
  }
  const bytes = await out.save()
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode page image'))), 'image/png'),
  )
}
