import type { BBox, Box, PiiSource, PiiType, Span, Word } from '../types'

/** Padding around each box, in original image pixels. */
export const BOX_PADDING = 4

/** Detection id for a span; stable for the same span, so React keys and toggles survive re-renders. */
export function spanId(span: Pick<Span, 'source' | 'type' | 'start' | 'end'>): string {
  return `${span.source}:${span.type}:${span.start}-${span.end}`
}

/**
 * One box per OCR line a span touches: the union of the bboxes of every word whose
 * [charStart, charEnd) overlaps the span, padded by BOX_PADDING.
 */
export function spansToBoxes(spans: Span[], words: Word[]): Box[] {
  const boxes: Box[] = []
  for (const span of spans) {
    const group = spanId(span)
    const byLine = new Map<number, BBox>()
    for (const w of words) {
      if (w.charStart >= span.end || w.charEnd <= span.start) continue
      const b = byLine.get(w.line)
      byLine.set(
        w.line,
        b
          ? { x0: Math.min(b.x0, w.bbox.x0), y0: Math.min(b.y0, w.bbox.y0), x1: Math.max(b.x1, w.bbox.x1), y1: Math.max(b.y1, w.bbox.y1) }
          : { ...w.bbox },
      )
    }
    for (const [line, b] of [...byLine].sort((a, c) => a[0] - c[0])) {
      boxes.push({
        id: `${group}:L${line}`,
        group,
        type: span.type,
        source: span.source,
        text: span.text,
        enabled: true,
        bbox: {
          x0: Math.max(0, b.x0 - BOX_PADDING),
          y0: Math.max(0, b.y0 - BOX_PADDING),
          x1: b.x1 + BOX_PADDING,
          y1: b.y1 + BOX_PADDING,
        },
      })
    }
  }
  return boxes
}

/**
 * All case-insensitive occurrences of `needle` in `fullText`, treating any run of whitespace
 * (spaces, newlines) as one space. Offsets point into the ORIGINAL fullText.
 */
export function findSubstringSpans(fullText: string, needle: string, type: PiiType, source: PiiSource): Span[] {
  const target = needle.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!target) return []

  // Normalized text plus, for each normalized char, its index in fullText.
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < fullText.length; i++) {
    if (/\s/.test(fullText[i])) {
      if (norm.endsWith(' ') || norm === '') continue
      norm += ' '
    } else {
      norm += fullText[i].toLowerCase()
    }
    map.push(i)
  }

  const spans: Span[] = []
  for (let at = norm.indexOf(target); at !== -1; at = norm.indexOf(target, at + target.length)) {
    const start = map[at]
    const end = map[at + target.length - 1] + 1
    spans.push({ start, end, type, source, text: fullText.slice(start, end) })
  }
  return spans
}

function area(b: BBox): number {
  return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)
}

/** Intersection area as a fraction of the smaller box. */
export function overlapRatio(a: BBox, b: BBox): number {
  const inter = area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) })
  const smaller = Math.min(area(a), area(b))
  return smaller > 0 ? inter / smaller : 0
}

/**
 * Drops boxes that overlap an already-kept box by more than 60% (of the smaller box).
 * When a regex box and an LLM box collide, the regex one is kept; otherwise the first wins.
 */
export function mergeBoxes(boxes: Box[]): Box[] {
  const ordered = boxes.map((box, i) => ({ box, i })).sort((a, b) => Number(b.box.source === 'regex') - Number(a.box.source === 'regex'))
  const kept: { box: Box; i: number }[] = []
  for (const o of ordered) {
    if (!kept.some((k) => overlapRatio(k.box.bbox, o.box.bbox) > 0.6)) kept.push(o)
  }
  // Back to input (text) order.
  return kept.sort((a, b) => a.i - b.i).map((k) => k.box)
}
