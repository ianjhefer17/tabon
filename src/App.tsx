import { useEffect, useRef, useState } from 'react'
import { DebugPanel, isDebug } from './components/DebugPanel'
import { DocumentView } from './components/DocumentView'
import { DropZone } from './components/DropZone'
import { Header } from './components/Header'
import { LlmBanner } from './components/LlmBanner'
import { SampleRow } from './components/SampleRow'
import { SidePanel, type AiPhase, type PanelPhase } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import { useLlm } from './hooks/useLlm'
import { detectLlm, type ModelKey } from './lib/llmPii'
import { dropCoveredSpans, mergeBoxes, spansToBoxes } from './lib/match'
import { runOcr, type OcrSource } from './lib/ocr'
import { canvasToBlob, openPdf, type PdfDoc } from './lib/pdf'
import { useUpdateReady } from './lib/pwa'
import { detectRegex } from './lib/regexPii'
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

const DEBUG = isDebug()

const READY = 'Ready. Drop a document to begin.'

interface Timings {
  ocr?: number
  rules?: number
  ai?: number
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)}s`
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

function App() {
  const [boxes, setBoxes] = useState<Box[]>([])
  const [ocrDone, setOcrDone] = useState(false)
  const [showOcr, setShowOcr] = useState(false)
  const [doc, setDoc] = useState<LoadedDoc | null>(null)
  const [words, setWords] = useState<Word[]>([])
  const [fullText, setFullText] = useState('')
  const [status, setStatus] = useState(READY)
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle')
  const [timings, setTimings] = useState<Timings>({})
  const runId = useRef(0)
  /** Bumped whenever an AI scan result must be ignored (new document, new model). */
  const aiRun = useRef(0)
  const pdfRef = useRef<PdfDoc | null>(null)
  const updateReady = useUpdateReady()
  const llm = useLlm()

  // Stage 3: once OCR is done and the model is ready, scan with the LLM and merge its boxes in.
  useEffect(() => {
    if (!ocrDone || aiPhase !== 'waiting') return
    if (llm.status === 'unsupported' || llm.status === 'error') {
      setAiPhase('off')
      return
    }
    if (llm.status !== 'ready') return
    const run = ++aiRun.current
    setAiPhase('scanning')
    const t0 = performance.now()
    detectLlm(fullText, () => run !== aiRun.current)
      .then((spans) => {
        if (run !== aiRun.current) return
        // Skip AI finds the rules already cover (e.g. two rule-found IDs returned as one item).
        const llmBoxes = spansToBoxes(dropCoveredSpans(spans, detectRegex(fullText)), words)
        setBoxes((bs) => mergeBoxes([...bs.filter((b) => b.source !== 'llm'), ...llmBoxes]))
        setTimings((t) => ({ ...t, ai: performance.now() - t0 }))
        setAiPhase('done')
      })
      .catch((err) => {
        if (run !== aiRun.current) return
        console.error(err)
        setAiPhase('failed')
      })
  }, [ocrDone, aiPhase, llm.status, fullText, words])

  // Supersedes any running AI scan: its result is ignored and it stops at the next chunk.
  const stopAi = () => {
    aiRun.current++
  }

  const changeModel = (key: ModelKey) => {
    if (key === llm.modelKey) return
    stopAi()
    llm.setModelKey(key)
    if (ocrDone) {
      // Re-scan the open document with the new model.
      setBoxes((bs) => bs.filter((b) => b.source !== 'llm'))
      setTimings((t) => ({ ...t, ai: undefined }))
      setAiPhase('waiting')
    }
  }

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
    stopAi()
    setDoc(next)
    setWords([])
    setFullText('')
    setBoxes([])
    setOcrDone(false)
    setAiPhase('idle')
    setTimings({})
    const label = next.numPages ? `${next.name} (page ${next.page} of ${next.numPages})` : next.name
    setStatus(`Reading text from ${label}… 0%`)
    const tOcr = performance.now()
    const result = await runOcr(source, (percent, step) => {
      if (id === runId.current) setStatus(`Reading text from ${label}… ${percent}% (${step})`)
    })
    if (id !== runId.current) return
    // Stage 2: rule-based boxes appear immediately; the LLM scan (effect above) adds to them.
    const tRules = performance.now()
    const found = mergeBoxes(spansToBoxes(detectRegex(result.fullText), result.words))
    setTimings({ ocr: tRules - tOcr, rules: performance.now() - tRules })
    setWords(result.words)
    setFullText(result.fullText)
    setBoxes(found)
    setOcrDone(true)
    setAiPhase('waiting')
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
    stopAi()
    closePdf()
    setDoc(null)
    setWords([])
    setFullText('')
    setBoxes([])
    setOcrDone(false)
    setAiPhase('idle')
    setTimings({})
    setStatus(READY)
  }

  const toggleGroup = (group: string) =>
    setBoxes((bs) => {
      const next = !bs.filter((b) => b.group === group).every((b) => b.enabled)
      return bs.map((b) => (b.group === group ? { ...b, enabled: next } : b))
    })
  const setAll = (enabled: boolean) => setBoxes((bs) => bs.map((b) => ({ ...b, enabled })))
  const phase: PanelPhase = !doc ? 'empty' : ocrDone ? 'done' : 'reading'

  // Status bar: progress/errors from `status` until OCR is done, then a summary plus stage timings.
  let message = status
  let detail = ''
  if (doc && ocrDone) {
    const count = new Set(boxes.map((b) => b.group)).size
    const label = doc.numPages ? `${doc.name} (page ${doc.page} of ${doc.numPages})` : doc.name
    message = `Found ${count} possible personal ${count === 1 ? 'detail' : 'details'} in ${label}. Review before sharing.`
    const ai = {
      idle: '',
      waiting: llm.status === 'loading' ? `AI waiting for model (${llm.progress?.percent ?? 0}%)` : 'AI waiting…',
      scanning: 'AI scanning…',
      done: `AI ${formatMs(timings.ai ?? 0)}`,
      off: 'AI off (rules only)',
      failed: 'AI failed (rules only)',
    }[aiPhase]
    detail = [timings.ocr !== undefined && `OCR ${formatMs(timings.ocr)}`, timings.rules !== undefined && `Rules ${formatMs(timings.rules)}`, ai]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <Header />
      <LlmBanner llm={llm} />
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
              <DocumentView
                src={doc.url}
                width={doc.width}
                height={doc.height}
                words={words}
                boxes={boxes}
                showWords={showOcr}
                onToggle={toggleGroup}
              />
            </div>
          ) : (
            <DropZone onFile={handleFile} />
          )}
          <SampleRow onFile={handleFile} />
          {DEBUG && <DebugPanel llm={llm} />}
        </main>
        <SidePanel
          phase={phase}
          boxes={boxes}
          onToggle={toggleGroup}
          onSetAll={setAll}
          showOcr={showOcr}
          onShowOcrChange={setShowOcr}
          fullText={fullText}
          aiPhase={aiPhase}
          llm={llm}
          onModelChange={changeModel}
        />
      </div>
      <StatusBar message={message} detail={detail} />
    </div>
  )
}

export default App
