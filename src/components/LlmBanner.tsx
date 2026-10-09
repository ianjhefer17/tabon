import type { LlmState } from '../hooks/useLlm'

// Background model download / WebGPU status, shown under the header.
export function LlmBanner({ llm }: { llm: LlmState }) {
  if (llm.status === 'unsupported') {
    return (
      <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-sm text-amber-200">
        Your browser lacks WebGPU — using rule-based detection only.
      </div>
    )
  }
  if (llm.status === 'error') {
    return (
      <div role="status" className="border-b border-red-500/30 bg-red-500/10 px-6 py-2 text-sm text-red-200">
        The AI model could not load — using rule-based detection only.
        {llm.error && <span className="ml-1 text-red-300/70">({llm.error})</span>}
      </div>
    )
  }
  if (llm.status === 'loading') {
    const percent = llm.progress?.percent ?? 0
    const text = llm.progress?.text ?? ''
    // web-llm reports downloading ("Fetching param cache…") and then loading onto the GPU
    // ("Loading model from cache…", "Loading GPU shader modules…") as two separate 0-100% phases.
    const onGpu = /Loading model from cache|Loading GPU shader/.test(text)
    const label = !llm.progress
      ? 'Starting AI model…'
      : onGpu
      ? 'Preparing AI model on your GPU…'
      : llm.progress?.fromCache
        ? 'Loading AI model from this device…'
        : 'Downloading AI model (one-time, stays on your device)…'
    return (
      <div role="status" className="border-b border-gray-800 px-6 py-2">
        <div className="flex items-center justify-between text-xs text-gray-300">
          <span>{label}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="AI model download"
        >
          <div className="h-full bg-amber-400 transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }
  return null
}
