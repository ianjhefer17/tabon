import { useCallback, useEffect, useRef, useState } from 'react'
import { DebugPanel, isDebug } from './components/DebugPanel'
import { DocumentView } from './components/DocumentView'
import { DropZone } from './components/DropZone'
import { ExportModal } from './components/ExportModal'
import { Header } from './components/Header'
import { LlmBanner } from './components/LlmBanner'
import { PageStrip } from './components/PageStrip'
import { PrivacyModal } from './components/PrivacyModal'
import { SampleRow } from './components/SampleRow'
import { SidePanel, type AiPhase, type PanelPhase } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import { useLlm } from './hooks/useLlm'
import { useOfflineStatus } from './hooks/useOfflineStatus'
import { detectLlm, type ModelKey } from './lib/llmPii'
import { dropCoveredSpans, mergeBoxes, spansToBoxes } from './lib/match'
import { runOcr, type OcrSource } from './lib/ocr'
import { canvasToBlob, imagesToPdf, openPdf, type PdfDoc } from './lib/pdf'
import { useUpdateReady } from './lib/pwa'
import { copyPng, downloadBlob, redactImage, redactedFileName, redactedPdfName, toPngBlob, type RedactStyle } from './lib/redact'
import { detectRegex } from './lib/regexPii'
import { applyPreset, type PresetKey } from './lib/presets'
import type { BBox, Box, Span, Word } from './types'

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

interface Preview {
  url: string
  blob: Blob
  fileName: string
}

interface Timings {
  ocr?: number
  rules?: number
  ai?: number
}

/** A scanned PDF page, kept so detections and toggles survive switching pages. */
interface PageState {
  words: Word[]
  fullText: string
  boxes: Box[]
  aiPhase: AiPhase
  timings: Timings
}

interface PageImage {
  url: string
  width: number
  height: number
}

/** AI spans → boxes, skipping finds the rules already cover (e.g. two rule-found IDs returned as one item). */
function llmBoxes(spans: Span[], fullText: string, words: Word[]): Box[] {
  return spansToBoxes(dropCoveredSpans(spans, detectRegex(fullText)), words)
}

function pageList(pages: number[]): string {
  return pages.length === 1 ? `page ${pages[0]}` : `pages ${pages.slice(0, -1).join(', ')} and ${pages[pages.length - 1]}`
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
  const [doc, setDoc] = useState<LoadedDoc | null>(null)
  const [words, setWords] = useState<Word[]>([])
  const [fullText, setFullText] = useState('')
  const [status, setStatus] = useState(READY)
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle')
  const [timings, setTimings] = useState<Timings>({})
  const [redactStyle, setRedactStyle] = useState<RedactStyle>('black')
  const [preset, setPreset] = useState<PresetKey>('everything')
  /** Read by async scans so new detections get the current preset's defaults. */
  const presetRef = useRef(preset)
  presetRef.current = preset
  const [drawing, setDrawing] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const runId = useRef(0)
  const manualCount = useRef(0)
  /** Bumped whenever an AI scan result must be ignored (new document, new model). */
  const aiRun = useRef(0)
  const pdfRef = useRef<PdfDoc | null>(null)
  /** Bumped when a PDF is closed so its background work (thumbnails, export) stops. */
  const pdfSession = useRef(0)
  /** Rendered page images (object URLs) of the open PDF, by page number. */
  const pageImages = useRef(new Map<number, PageImage>())
  const [pages, setPages] = useState(new Map<number, PageState>())
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const [viewed, setViewed] = useState(new Set<number>())
  const [thumbs, setThumbs] = useState<(string | undefined)[]>([])
  const thumbsRef = useRef(thumbs)
  thumbsRef.current = thumbs
  const updateReady = useUpdateReady()
  const llm = useLlm()
  const offline = useOfflineStatus(llm)

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
        const found = applyPreset(llmBoxes(spans, fullText, words), presetRef.current)
        setBoxes((bs) => mergeBoxes([...bs.filter((b) => b.source !== 'llm'), ...found]))
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

  // Release the previous object URL when the document changes. PDF page images are released by closePdf.
  useEffect(() => () => {
    if (doc && !doc.numPages) URL.revokeObjectURL(doc.url)
  }, [doc])

  // Keep each scanned PDF page's detections, so toggles and drawn boxes survive switching pages.
  useEffect(() => {
    if (!doc?.page || !ocrDone) return
    const page = doc.page
    setPages((prev) => new Map(prev).set(page, { words, fullText, boxes, aiPhase, timings }))
  }, [doc, ocrDone, words, fullText, boxes, aiPhase, timings])

  // Release the preview's object URL when it is replaced or closed.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url)
  }, [preview])

  const resetExport = () => {
    setDrawing(false)
    setExportStatus('')
    setPreview(null)
  }

  const closePdf = () => {
    pdfSession.current++
    pdfRef.current?.destroy().catch(() => undefined)
    pdfRef.current = null
    for (const { url } of pageImages.current.values()) URL.revokeObjectURL(url)
    pageImages.current = new Map()
    for (const url of thumbsRef.current) if (url) URL.revokeObjectURL(url)
    setThumbs([])
    setPages(new Map())
    setViewed(new Set())
  }

  // Renders the page thumbnails one after another in the background.
  const loadThumbs = async (pdf: PdfDoc) => {
    const session = pdfSession.current
    try {
      for (let n = 1; n <= pdf.numPages; n++) {
        const url = URL.createObjectURL(await canvasToBlob(await pdf.renderThumb(n)))
        if (session !== pdfSession.current) {
          URL.revokeObjectURL(url)
          return
        }
        setThumbs((t) => {
          const next = [...t]
          next[n - 1] = url
          return next
        })
      }
    } catch (err) {
      if (session === pdfSession.current) console.error(err)
    }
  }

  // The full-resolution image of a PDF page; `canvas` is set when it was rendered just now.
  const renderPdfPage = async (pdf: PdfDoc, page: number): Promise<PageImage & { canvas?: HTMLCanvasElement }> => {
    const images = pageImages.current
    const have = images.get(page)
    if (have) return have
    const canvas = await pdf.renderPage(page)
    const image = { url: URL.createObjectURL(await canvasToBlob(canvas)), width: canvas.width, height: canvas.height }
    images.set(page, image)
    return { ...image, canvas }
  }

  const fail = (id: number, name: string, err: unknown) => {
    if (id !== runId.current) return
    console.error(err)
    setStatus(`Could not read ${name}: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Shows the page image and runs OCR on it. `source` is the full-resolution pixels.
  const showAndOcr = async (id: number, next: LoadedDoc, source: OcrSource) => {
    stopAi()
    resetExport()
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
    const found = applyPreset(mergeBoxes(spansToBoxes(detectRegex(result.fullText), result.words)), presetRef.current)
    setTimings({ ocr: tRules - tOcr, rules: performance.now() - tRules })
    setWords(result.words)
    setFullText(result.fullText)
    setBoxes(found)
    setOcrDone(true)
    setAiPhase('waiting')
  }

  const showPdfPage = async (id: number, pdf: PdfDoc, name: string, page: number) => {
    setStatus(`Rendering ${name} page ${page}…`)
    const image = await renderPdfPage(pdf, page)
    if (id !== runId.current) return
    const next = { url: image.url, name, width: image.width, height: image.height, page, numPages: pdf.numPages }
    setViewed((v) => new Set(v).add(page))
    const cached = pagesRef.current.get(page)
    if (cached) {
      // Scanned before: restore its detections instead of reading it again.
      stopAi()
      resetExport()
      setDoc(next)
      setWords(cached.words)
      setFullText(cached.fullText)
      setBoxes(cached.boxes)
      setOcrDone(true)
      setTimings(cached.timings)
      setAiPhase(cached.aiPhase === 'scanning' ? 'waiting' : cached.aiPhase)
      return
    }
    await showAndOcr(id, next, image.canvas ?? (await loadImage(image.url)))
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
        void loadThumbs(pdf)
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
    if (!pdf || !doc || page < 1 || page > pdf.numPages || page === doc.page) return
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
    resetExport()
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
  const addManualBox = (bbox: BBox) => {
    const group = `manual:${++manualCount.current}`
    setBoxes((bs) => [...bs, { id: group, group, type: 'other', source: 'manual', bbox, enabled: true, text: `Drawn box ${manualCount.current}` }])
  }

  // Full-resolution redacted PNG of the current page, from the original pixels (not the preview).
  const buildPng = async (): Promise<Blob> => {
    if (!doc) throw new Error('No document loaded')
    const img = await loadImage(doc.url)
    return toPngBlob(redactImage(img, boxes, redactStyle))
  }

  const exportPng = async () => {
    if (!doc) return
    setExporting(true)
    setExportStatus('')
    try {
      const blob = await buildPng()
      const fileName = redactedFileName(doc.name, doc.page, doc.numPages)
      downloadBlob(blob, fileName)
      setCopyStatus('')
      setPreview({ url: URL.createObjectURL(blob), blob, fileName })
    } catch (err) {
      console.error(err)
      setExportStatus(`Could not export: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  // Every page redacted into one image-only PDF. Pages not scanned yet are scanned here first.
  const exportAllPages = async () => {
    const pdf = pdfRef.current
    if (!pdf || !doc?.page) return
    const session = pdfSession.current
    const total = pdf.numPages
    setExporting(true)
    setExportStatus('')
    try {
      const pngs: Blob[] = []
      for (let n = 1; n <= total; n++) {
        setExportStatus(`Redacting page ${n} of ${total}…`)
        const image = await renderPdfPage(pdf, n)
        let pageBoxes = n === doc.page ? boxes : pagesRef.current.get(n)?.boxes
        if (!pageBoxes) {
          setExportStatus(`Reading page ${n} of ${total}…`)
          const source = image.canvas ?? (await loadImage(image.url))
          const result = await runOcr(source)
          if (session !== pdfSession.current) return
          pageBoxes = mergeBoxes(spansToBoxes(detectRegex(result.fullText), result.words))
          let aiPhase: AiPhase = 'waiting'
          if (llm.status === 'ready') {
            setExportStatus(`AI scanning page ${n} of ${total}…`)
            try {
              const spans = await detectLlm(result.fullText, () => session !== pdfSession.current)
              pageBoxes = mergeBoxes([...pageBoxes, ...llmBoxes(spans, result.fullText, result.words)])
              aiPhase = 'done'
            } catch (err) {
              console.error(err)
              aiPhase = 'failed'
            }
          } else if (llm.status === 'unsupported' || llm.status === 'error') {
            aiPhase = 'off'
          }
          if (session !== pdfSession.current) return
          pageBoxes = applyPreset(pageBoxes, presetRef.current)
          const state: PageState = { words: result.words, fullText: result.fullText, boxes: pageBoxes, aiPhase, timings: {} }
          setPages((prev) => new Map(prev).set(n, state))
        }
        pngs.push(await toPngBlob(redactImage(await loadImage(image.url), pageBoxes, redactStyle)))
        if (session !== pdfSession.current) return
      }
      setExportStatus('Building PDF…')
      const blob = await imagesToPdf(pngs)
      if (session !== pdfSession.current) return
      const fileName = redactedPdfName(doc.name)
      downloadBlob(blob, fileName)
      const unreviewed = Array.from({ length: total }, (_, i) => i + 1).filter((n) => n !== doc.page && !viewed.has(n))
      setExportStatus(
        `Saved ${fileName} (${total} pages). ` +
          (unreviewed.length ? `You have not opened ${pageList(unreviewed)} yet: check ${unreviewed.length === 1 ? 'it' : 'them'} before sharing.` : 'Review before sharing.'),
      )
    } catch (err) {
      console.error(err)
      if (session === pdfSession.current) setExportStatus(`Could not export: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  const copy = async (blob: Promise<Blob>, report: (msg: string) => void) => {
    report('Copying…')
    try {
      await copyPng(blob)
      report('Copied redacted image to clipboard.')
    } catch (err) {
      console.error(err)
      report(`Could not copy: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const closePreview = useCallback(() => setPreview(null), [])

  const setAll = (enabled: boolean) => setBoxes((bs) => bs.map((b) => ({ ...b, enabled })))
  // A new preset resets every box (this page and other scanned PDF pages) to its defaults; toggles still work after.
  const changePreset = (key: PresetKey) => {
    setPreset(key)
    setBoxes((bs) => applyPreset(bs, key))
    setPages((prev) => new Map([...prev].map(([n, p]) => [n, { ...p, boxes: applyPreset(p.boxes, key) }])))
  }
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
      <Header offline={offline} aiAvailable={llm.status !== 'unsupported'} onPrivacy={() => setShowPrivacy(true)} />
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
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
                  <button
                    type="button"
                    onClick={() => setDrawing((d) => !d)}
                    disabled={!ocrDone}
                    aria-pressed={drawing}
                    title="Drag on the image to cover anything the scan missed"
                    className={`rounded-md border px-3 py-1 text-sm disabled:opacity-50 ${
                      drawing ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200' : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {drawing ? 'Done drawing' : 'Draw box'}
                  </button>
                  <button type="button" onClick={clear} className="rounded-md border border-gray-700 px-3 py-1 text-sm hover:border-gray-500">
                    New document
                  </button>
                </div>
              </div>
              {doc.page && doc.numPages && doc.numPages > 1 && (
                <PageStrip
                  page={doc.page}
                  numPages={doc.numPages}
                  thumbs={thumbs}
                  counts={new Map([...pages].map(([n, p]) => [n, new Set(p.boxes.filter((b) => b.enabled).map((b) => b.group)).size]))}
                  viewed={viewed}
                  disabled={exporting}
                  onSelect={changePage}
                />
              )}
              <DocumentView
                key={doc.url}
                src={doc.url}
                width={doc.width}
                height={doc.height}
                words={words}
                boxes={boxes}
                showWords={DEBUG}
                onToggle={toggleGroup}
                drawing={drawing}
                onDraw={addManualBox}
              />
              {drawing && <p className="mt-2 text-center text-xs text-gray-400">Drag on the image to add a redaction box.</p>}
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
          preset={preset}
          onPresetChange={changePreset}
          aiPhase={aiPhase}
          llm={llm}
          onModelChange={changeModel}
          redactStyle={redactStyle}
          onRedactStyleChange={setRedactStyle}
          onExport={exportPng}
          onExportAll={doc?.numPages && doc.numPages > 1 ? exportAllPages : undefined}
          onCopy={() => copy(buildPng(), setExportStatus)}
          exporting={exporting}
          exportStatus={exportStatus}
        />
      </div>
      <StatusBar message={message} detail={detail} />
      {preview && (
        <ExportModal
          url={preview.url}
          fileName={preview.fileName}
          onDownload={() => downloadBlob(preview.blob, preview.fileName)}
          onCopy={() => copy(Promise.resolve(preview.blob), setCopyStatus)}
          copyStatus={copyStatus}
          onClose={closePreview}
        />
      )}
    </div>
  )
}

export default App
