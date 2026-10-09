import { describe, expect, it } from 'vitest'
import { maskText } from './piiStyle'

describe('maskText', () => {
  it('keeps the start and the last 3 characters', () => {
    expect(maskText('0917 123 4567')).toBe('0917 •••• 567')
    expect(maskText('JUAN MIGUEL DELA\nCRUZ SANTOS')).toBe('JUAN •••• TOS')
  })
  it('shows only the first character of short values', () => {
    expect(maskText('M')).toBe('M••••')
    expect(maskText('123456')).toBe('1••••')
  })
})
