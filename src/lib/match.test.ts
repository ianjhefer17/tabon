import { describe, expect, it } from 'vitest'
import { BOX_PADDING, dropCoveredSpans, findFuzzySpan, findSubstringSpans, mergeBoxes, spansToBoxes } from './match'
import type { Box, Span, Word } from '../types'

// fullText for these words: "Name: JUAN DELA\nCRUZ 0917"
//                            0123456789012345 6789012345
const TEXT = 'Name: JUAN DELA\nCRUZ 0917'
const WORDS: Word[] = [
  { text: 'Name:', charStart: 0, charEnd: 5, line: 0, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 } },
  { text: 'JUAN', charStart: 6, charEnd: 10, line: 0, bbox: { x0: 70, y0: 12, x1: 120, y1: 30 } },
  { text: 'DELA', charStart: 11, charEnd: 15, line: 0, bbox: { x0: 130, y0: 10, x1: 180, y1: 32 } },
  { text: 'CRUZ', charStart: 16, charEnd: 20, line: 1, bbox: { x0: 10, y0: 50, x1: 60, y1: 70 } },
  { text: '0917', charStart: 21, charEnd: 25, line: 1, bbox: { x0: 70, y0: 50, x1: 120, y1: 70 } },
]

function span(start: number, end: number, type: Span['type'] = 'name', source: Span['source'] = 'regex'): Span {
  return { start, end, type, source, text: TEXT.slice(start, end) }
}

describe('findSubstringSpans', () => {
  it('maps a case-insensitive match back to original offsets', () => {
    const [s] = findSubstringSpans(TEXT, 'juan dela', 'name', 'llm')
    expect(s).toEqual({ start: 6, end: 15, type: 'name', source: 'llm', text: 'JUAN DELA' })
  })

  it('treats newlines and repeated spaces as one space', () => {
    const [s] = findSubstringSpans(TEXT, 'dela   cruz', 'name', 'llm')
    expect(s.text).toBe('DELA\nCRUZ')
    expect([s.start, s.end]).toEqual([11, 20])
  })

  it('normalizes whitespace in the text too and trims the needle', () => {
    const text = 'Addr:  Blk 12\n\n  Lot 5'
    const [s] = findSubstringSpans(text, '  blk 12 lot 5 ', 'address', 'llm')
    expect(s.text).toBe('Blk 12\n\n  Lot 5')
    expect(text.slice(s.start, s.end)).toBe(s.text)
  })

  it('returns every occurrence', () => {
    const text = 'Juan paid. JUAN signed. juan'
    expect(findSubstringSpans(text, 'Juan', 'name', 'llm').map((s) => s.start)).toEqual([0, 11, 24])
  })

  it('returns nothing for no match or an empty needle', () => {
    expect(findSubstringSpans(TEXT, 'maria', 'name', 'llm')).toEqual([])
    expect(findSubstringSpans(TEXT, '   ', 'name', 'llm')).toEqual([])
  })
})

describe('spansToBoxes', () => {
  it('boxes a single word with padding', () => {
    const [b] = spansToBoxes([span(21, 25, 'phone')], WORDS)
    expect(b.bbox).toEqual({ x0: 70 - BOX_PADDING, y0: 50 - BOX_PADDING, x1: 120 + BOX_PADDING, y1: 70 + BOX_PADDING })
    expect(b).toMatchObject({ type: 'phone', source: 'regex', enabled: true, text: '0917' })
  })

  it('unions words on the same line', () => {
    const boxes = spansToBoxes([span(6, 15)], WORDS)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].bbox).toEqual({ x0: 66, y0: 6, x1: 184, y1: 36 })
  })

  it('produces one box per line for a span that crosses lines, in one group', () => {
    const boxes = spansToBoxes([span(6, 20)], WORDS)
    expect(boxes).toHaveLength(2)
    expect(boxes[0].bbox.y1).toBeLessThan(boxes[1].bbox.y0)
    expect(new Set(boxes.map((b) => b.group)).size).toBe(1)
    expect(boxes.map((b) => b.text)).toEqual(['JUAN DELA\nCRUZ', 'JUAN DELA\nCRUZ'])
  })

  it('includes a word that is only partly inside the span', () => {
    // "UAN" is inside "JUAN"
    const [b] = spansToBoxes([span(7, 10)], WORDS)
    expect(b.bbox.x0).toBe(70 - BOX_PADDING)
  })

  it('does not include words that only touch the span edge', () => {
    // span is exactly "DELA"; "JUAN" ends at 10 and "CRUZ" starts at 16
    const boxes = spansToBoxes([span(11, 15)], WORDS)
    expect(boxes).toHaveLength(1)
    expect(boxes[0].bbox.x0).toBe(130 - BOX_PADDING)
  })

  it('gives stable, unique ids', () => {
    const a = spansToBoxes([span(6, 20), span(21, 25, 'phone')], WORDS)
    const b = spansToBoxes([span(6, 20), span(21, 25, 'phone')], WORDS)
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id))
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length)
  })

  it('clamps padding at the image edge', () => {
    const words: Word[] = [{ text: 'X', charStart: 0, charEnd: 1, line: 0, bbox: { x0: 1, y0: 2, x1: 10, y1: 10 } }]
    const [b] = spansToBoxes([{ start: 0, end: 1, type: 'other', source: 'regex', text: 'X' }], words)
    expect([b.bbox.x0, b.bbox.y0]).toEqual([0, 0])
  })
})

describe('mergeBoxes', () => {
  const box = (id: string, source: Box['source'], x0: number, x1: number): Box => ({
    id, group: id, text: id, type: 'name', source, enabled: true, bbox: { x0, y0: 0, x1, y1: 20 },
  })

  it('keeps the regex box when a regex and an LLM box overlap > 60%', () => {
    const merged = mergeBoxes([box('llm1', 'llm', 0, 100), box('re1', 'regex', 10, 100)])
    expect(merged.map((b) => b.id)).toEqual(['re1'])
  })

  it('keeps both when the overlap is small', () => {
    const merged = mergeBoxes([box('a', 'llm', 0, 100), box('b', 'regex', 80, 200)])
    expect(merged.map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('keeps a large box that merely contains a small one', () => {
    // e.g. an LLM box over "NAME 3012-4455-67" containing the regex account box
    const merged = mergeBoxes([box('re', 'regex', 300, 400), box('llm', 'llm', 0, 400)])
    expect(merged.map((b) => b.id)).toEqual(['re', 'llm'])
  })

  it('keeps the first of two same-source duplicates', () => {
    expect(mergeBoxes([box('a', 'llm', 0, 100), box('b', 'llm', 0, 100)]).map((b) => b.id)).toEqual(['a'])
  })
})

describe('findFuzzySpan', () => {
  const text = 'NAME\nJUAN MIGUEL DELA CRUZ SANTOS\nDATE OF BIRTH'

  it('recovers a slightly mis-copied value, spanning the real text', () => {
    const s = findFuzzySpan(text, 'JORAN MIGUEL DELA CRUZ SANTOS', 'name', 'llm')
    expect(s?.text).toBe('JUAN MIGUEL DELA CRUZ SANTOS')
    expect(text.slice(s!.start, s!.end)).toBe(s!.text)
  })

  it('rejects values that are not on the page', () => {
    expect(findFuzzySpan(text, 'MARIA CLARA REYES BAUTISTA', 'name', 'llm')).toBeNull()
    expect(findFuzzySpan(text, 'JUAN SANTOS', 'name', 'llm')).toBeNull()
  })

  it('ignores very short needles', () => {
    expect(findFuzzySpan(text, 'JAUN', 'name', 'llm')).toBeNull()
  })
})

describe('dropCoveredSpans', () => {
  const t = '34-1234567-8 12-345678901-2 HT-2019-0457'
  const sp = (start: number, end: number): Span => ({ start, end, type: 'id_number', source: 'llm', text: t.slice(start, end) })

  it('drops a span fully covered by others, ignoring spaces between them', () => {
    expect(dropCoveredSpans([sp(0, 27)], [sp(0, 12), sp(13, 27)])).toEqual([])
  })

  it('keeps a span with uncovered characters', () => {
    expect(dropCoveredSpans([sp(28, 40)], [sp(0, 12)])).toHaveLength(1)
  })
})
