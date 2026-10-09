import { describe, expect, it } from 'vitest'
import { chunkText, itemsToSpans, parseLlmJson } from './llmPii'

describe('chunkText', () => {
  it('returns no chunks for blank text, so the model is not asked about an empty page', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText(' \n ')).toEqual([])
  })

  it('keeps text up to 2500 chars whole', () => {
    const text = 'a'.repeat(2500)
    expect(chunkText(text)).toEqual([text])
  })

  it('splits longer text into ~2000-char chunks on line boundaries', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i} `.padEnd(79, 'x'))
    const text = lines.join('\n') // 60 * 80 - 1 chars
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2000)
    // Nothing lost, every chunk boundary is a line boundary.
    expect(chunks.join('\n')).toBe(text)
  })

  it('hard-splits a single line longer than a chunk', () => {
    const chunks = chunkText('y'.repeat(4500))
    expect(chunks.map((c) => c.length)).toEqual([2000, 2000, 500])
  })
})

describe('parseLlmJson', () => {
  it('parses plain JSON', () => {
    expect(parseLlmJson('{"pii":[{"text":"Juan Santos","type":"name"}]}')).toEqual([{ text: 'Juan Santos', type: 'name' }])
  })

  it('strips code fences and surrounding chatter', () => {
    const raw = 'Here you go:\n```json\n{"pii":[{"text":"0917 123 4567","type":"phone"}]}\n```'
    expect(parseLlmJson(raw)).toEqual([{ text: '0917 123 4567', type: 'phone' }])
  })

  it('maps unknown types to other and skips bad items', () => {
    const raw = '{"pii":[{"text":"X1","type":"weird"},{"text":""},{"type":"name"},{"text":"A","type":"name"},null]}'
    expect(parseLlmJson(raw)).toEqual([{ text: 'X1', type: 'other' }])
  })

  it('returns [] for broken or wrongly shaped output', () => {
    expect(parseLlmJson('not json')).toEqual([])
    expect(parseLlmJson('{"pii": "none"}')).toEqual([])
    expect(parseLlmJson('{"pii":[{"text":"cut off')).toEqual([])
  })
})

describe('itemsToSpans', () => {
  const text = 'EMPLOYEE NAME\nJUAN MIGUEL DELA CRUZ\nSANTOS 34-1234567-8\nNet pay PHP 32,451.00'

  it('locates items in the original text (case and whitespace aside)', () => {
    const [s] = itemsToSpans(text, [{ text: 'Juan Miguel Dela Cruz Santos', type: 'name' }])
    expect(s).toMatchObject({ type: 'name', source: 'llm', text: 'JUAN MIGUEL DELA CRUZ\nSANTOS' })
  })

  it('drops hallucinated items that are not in the text', () => {
    expect(itemsToSpans(text, [{ text: 'Maria Clara', type: 'name' }])).toEqual([])
  })

  it('drops currency amounts', () => {
    expect(itemsToSpans(text, [{ text: 'PHP 32,451.00', type: 'account' }, { text: '32,451.00', type: 'account' }])).toEqual([])
  })

  it('dedupes the same span reported twice', () => {
    const spans = itemsToSpans(text, [
      { text: '34-1234567-8', type: 'id_number' },
      { text: '34-1234567-8', type: 'id_number' },
    ])
    expect(spans).toHaveLength(1)
  })
})
