import { useState } from 'react'
import type { LlmState } from '../hooks/useLlm'
import { detectLlm } from '../lib/llmPii'
import { dropCoveredSpans, mergeBoxes, spansToBoxes } from '../lib/match'
import { runOcr } from '../lib/ocr'
import { detectRegex } from '../lib/regexPii'
import type { Box } from '../types'
import { SAMPLES, loadSample } from './SampleRow'

// Hidden benchmark (open the app with ?debug=1): runs the full pipeline on each sample, same steps as App.

interface Row {
  file: string
  ocrMs?: number
  regexCount?: number
  llmMs?: number
  llmCount?: number
  mergedCount?: number
  error?: string
}

const groups = (boxes: Box[]) => new Set(boxes.map((b) => b.group)).size
const ms = (n?: number) => (n === undefined ? '…' : Math.round(n).toLocaleString())

export function isDebug(): boolean {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

export function DebugPanel({ llm }: { llm: LlmState }) {
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    const out: Row[] = []
    const update = (row: Row) => setRows([...out, row])
    for (const s of SAMPLES) {
      const row: Row = { file: s.file }
      update(row)
      try {
        const file = await loadSample(s.file)
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.src = url
        await img.decode()
        let t = performance.now()
        const ocr = await runOcr(img)
        URL.revokeObjectURL(url)
        row.ocrMs = performance.now() - t
        const regexSpans = detectRegex(ocr.fullText)
        const ruleBoxes = mergeBoxes(spansToBoxes(regexSpans, ocr.words))
        row.regexCount = groups(ruleBoxes)
        update(row)
        if (llm.status === 'ready') {
          t = performance.now()
          const spans = await detectLlm(ocr.fullText)
          row.llmMs = performance.now() - t
          const llmBoxes = spansToBoxes(dropCoveredSpans(spans, regexSpans), ocr.words)
          row.llmCount = groups(llmBoxes)
          row.mergedCount = groups(mergeBoxes([...ruleBoxes, ...llmBoxes]))
        } else {
          row.mergedCount = row.regexCount
        }
      } catch (err) {
        row.error = err instanceof Error ? err.message : String(err)
      }
      out.push(row)
      setRows([...out])
    }
    console.info('[tabon-bench]', JSON.stringify({ model: llm.modelId, rows: out }))
    setRunning(false)
  }

  return (
    <section className="mt-6 rounded-lg border border-fuchsia-500/40 bg-gray-900 p-4 text-sm" data-testid="debug-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-fuchsia-300">Debug benchmark</h2>
        <span className="text-xs text-gray-400">
          Model: {llm.modelId ?? llm.modelKey} ({llm.status}
          {llm.status === 'loading' && ` ${llm.progress?.percent ?? 0}%`})
        </span>
        <button
          type="button"
          onClick={run}
          disabled={running || llm.status === 'loading' || llm.status === 'checking'}
          className="rounded-md border border-fuchsia-500/60 px-3 py-1 hover:border-fuchsia-300 disabled:opacity-40"
        >
          {running ? 'Running…' : 'Run benchmark'}
        </button>
      </div>
      {rows.length > 0 && (
        <table className="mt-3 w-full text-left tabular-nums">
          <thead className="text-gray-400">
            <tr>
              <th>File</th>
              <th>OCR ms</th>
              <th>Regex</th>
              <th>LLM ms</th>
              <th>LLM</th>
              <th>Merged</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.file} className="border-t border-gray-800">
                <td>{r.file}</td>
                {r.error ? (
                  <td colSpan={5} className="text-red-400">{r.error}</td>
                ) : (
                  <>
                    <td>{ms(r.ocrMs)}</td>
                    <td>{r.regexCount ?? '…'}</td>
                    <td>{llm.status === 'ready' ? ms(r.llmMs) : 'off'}</td>
                    <td>{r.llmCount ?? (llm.status === 'ready' ? '…' : '–')}</td>
                    <td>{r.mergedCount ?? '…'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
