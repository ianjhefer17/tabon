interface PageStripProps {
  page: number
  numPages: number
  /** Thumbnail object URLs by page index (0-based); missing while still rendering. */
  thumbs: (string | undefined)[]
  /** Detections selected for redaction, per scanned page (1-based). */
  counts: Map<number, number>
  /** Pages the user has opened (1-based). */
  viewed: Set<number>
  disabled: boolean
  onSelect: (page: number) => void
}

// Prev/Next plus a row of page thumbnails for multi-page PDFs.
export function PageStrip({ page, numPages, thumbs, counts, viewed, disabled, onSelect }: PageStripProps) {
  const navButton = 'shrink-0 rounded-md border border-gray-700 px-3 py-1 text-sm hover:border-gray-500 disabled:opacity-40 disabled:hover:border-gray-700'
  return (
    <div className="mx-auto mb-3 flex w-full max-w-3xl items-center gap-2">
      <button type="button" onClick={() => onSelect(page - 1)} disabled={disabled || page <= 1} className={navButton}>
        Prev
      </button>
      <ol className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1" aria-label="Pages">
        {Array.from({ length: numPages }, (_, i) => {
          const n = i + 1
          const current = n === page
          const count = counts.get(n)
          return (
            <li key={n} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(n)}
                disabled={disabled}
                aria-current={current ? 'page' : undefined}
                aria-label={`Page ${n}${viewed.has(n) ? '' : ', not reviewed yet'}`}
                className={`relative block w-12 overflow-hidden rounded border-2 bg-white disabled:opacity-60 ${
                  current ? 'border-emerald-400' : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                {thumbs[i] ? (
                  <img src={thumbs[i]} alt="" className="block h-auto w-full" />
                ) : (
                  <span className="block aspect-[3/4] w-full animate-pulse bg-gray-300" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gray-950/80 text-center text-[10px] leading-4 text-gray-100">
                  {n}
                  {count !== undefined && <span className="text-amber-300"> · {count}</span>}
                </span>
                {!viewed.has(n) && <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-amber-400" title="Not reviewed yet" />}
              </button>
            </li>
          )
        })}
      </ol>
      <button type="button" onClick={() => onSelect(page + 1)} disabled={disabled || page >= numPages} className={navButton}>
        Next
      </button>
      <span className="shrink-0 text-xs text-gray-400">
        {page} / {numPages}
      </span>
    </div>
  )
}
