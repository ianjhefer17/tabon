import { useEffect, useRef, useState } from 'react'
import { DocumentView } from './components/DocumentView'
import { DropZone } from './components/DropZone'
import { Header } from './components/Header'
import { SampleRow } from './components/SampleRow'
import { SidePanel } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import { runOcr, type OcrSource } from './lib/ocr'
import { canvasToBlob, openPdf, type PdfDoc } from './lib/pdf'
import { useUpdateReady } from './lib/pwa'
import type { Box, Word } from './types'

interface LoadedDoc {
  url: string
  name: string
  width: number
  height: number
  /** Set for PDFs: current page (1-based) and page count. */
  page?: number
  numPages?: number
}

const READY = 'Ready. Drop a document to begin.'

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

function App() {
  const [boxes] = useState<Box[]>([])
  const [doc, setDoc] = useState<LoadedDoc | null>(null)
  const [words, setWords] = useState<Word[]>([])
  const [status, setStatus] = useState(READY)
  const runId = useRef(0)
  const pdfRef = useRef<PdfDoc | null>(null)
  const updateReady = useUpdateReady()

  // A new version is ready: load it now if nothing is open; otherwise wait for "New document".
  useEffect(() => {
    if (updateReady && !doc) window.location.reload()
  }, [updateReady, doc])

  // Release the previous object URL when the document changes.
  useEffect(() => () => {
    if (doc) URL.revokeObjectURL(doc.url)
  }, [doc])

  const closePdf = () => {
    pdfRef.current?.destroy().catch(() => undefined)
    pdfRef.current = null
  }

  const fail = (id: number, name: string, err: unknown) => {
    if (id !== runId.current) return
    console.error(err)
    setStatus(`Could not read ${name}: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Shows the page image and runs OCR on it. `source` is the full-resolution pixels.
  const showAndOcr = async (id: number, next: LoadedDoc, source: OcrSource) => {
    setDoc(next)
    setWords([])
    const label = next.numPages ? `${next.name} (page ${next.page} of ${next.numPages})` : next.name
    setStatus(`Reading text from ${label}… 0%`)
    const result = await runOcr(source, (percent, step) => {
      if (id === runId.current) setStatus(`Reading text from ${label}… ${percent}% (${step})`)
    })
    if (id !== runId.current) return
    setWords(result.words)
    setStatus(`Found ${result.words.length} words in ${label}. Review before sharing.`)
  }

  const showPdfPage = async (id: number, pdf: PdfDoc, name: string, page: number) => {
    setStatus(`Rendering ${name} page ${page}…`)
    const canvas = await pdf.renderPage(page)
    const url = URL.createObjectURL(await canvasToBlob(canvas))
    if (id !== runId.current) {
      URL.revokeObjectURL(url)
      return
    }
    await showAndOcr(id, { url, name, width: canvas.width, height: canvas.height, page, numPages: pdf.numPages }, canvas)
  }

  const handleFile = async (file: File) => {
    const id = ++runId.current
    closePdf()
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setStatus(`Opening ${file.name}…`)
        const pdf = await openPdf(file)
        if (id !== runId.current) {
          pdf.destroy().catch(() => undefined)
          return
        }
        pdfRef.current = pdf
        await showPdfPage(id, pdf, file.name, 1)
      } else if (file.type === 'image/png' || file.type === 'image/jpeg') {
        const url = URL.createObjectURL(file)
        const img = await loadImage(url)
        if (id !== runId.current) {
          URL.revokeObjectURL(url)
          return
        }
        await showAndOcr(id, { url, name: file.name, width: img.naturalWidth, height: img.naturalHeight }, img)
      } else {
        setStatus(`Unsupported file type: ${file.type || file.name}. Use PNG, JPG or PDF.`)
      }
    } catch (err) {
      fail(id, file.name, err)
    }
  }

  const changePage = async (page: number) => {
    const pdf = pdfRef.current
    if (!pdf || !doc) return
    const id = ++runId.current
    try {
      await showPdfPage(id, pdf, doc.name, page)
    } catch (err) {
      fail(id, doc.name, err)
    }
  }

  const clear = () => {
    if (updateReady) {
      window.location.reload()
      return
    }
    runId.current++
    closePdf()
    setDoc(null)
    setWords([])
    setStatus(READY)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <Header />
      <div className="flex flex-1 flex-col md:flex-row">
        <main className="flex flex-1 flex-col p-6">
          {doc ? (
            <div>
              {updateReady && (
                <p className="mb-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                  A new version of Tabon is ready. It will load when you click New document.
                </p>
              )}
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="truncate text-sm text-gray-300">{doc.name}</span>
                <div className="flex shrink-0 items-center gap-3">
                  {doc.numPages && doc.numPages > 1 && (
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                      Page
                      <select
                        value={doc.page}
                        onChange={(e) => changePage(Number(e.target.value))}
                        className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1"
                      >
                        {Array.from({ length: doc.numPages }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1} of {doc.numPages}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button type="button" onClick={clear} className="rounded-md border border-gray-700 px-3 py-1 text-sm hover:border-gray-500">
                    New document
                  </button>
                </div>
              </div>
              <DocumentView src={doc.url} width={doc.width} height={doc.height} words={words} />
            </div>
          ) : (
            <DropZone onFile={handleFile} />
          )}
          <SampleRow onFile={handleFile} />
        </main>
        <SidePanel boxes={boxes} />
      </div>
      <StatusBar message={status} />
    </div>
  )
}

export default App
