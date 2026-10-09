import { describe, expect, it } from 'vitest'
import type { Box, PiiType } from '../types'
import { applyPreset, presetEnabled } from './presets'

const box = (type: PiiType, source: Box['source'] = 'regex'): Box => ({
  id: type,
  group: type,
  type,
  source,
  bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
  enabled: false,
  text: type,
})

describe('presets', () => {
  it('everything redacts all types', () => {
    expect(applyPreset([box('name'), box('account')], 'everything').every((b) => b.enabled)).toBe(true)
  })

  it('landlord keeps the name visible and hides IDs', () => {
    expect(presetEnabled('landlord', box('name'))).toBe(false)
    expect(presetEnabled('landlord', box('id_number'))).toBe(true)
  })

  it('employer keeps contact details but hides account and address', () => {
    expect(presetEnabled('employer', box('phone'))).toBe(false)
    expect(presetEnabled('employer', box('email'))).toBe(false)
    expect(presetEnabled('employer', box('account'))).toBe(true)
    expect(presetEnabled('employer', box('address'))).toBe(true)
  })

  it('seller keeps name and address only', () => {
    expect(presetEnabled('seller', box('address'))).toBe(false)
    expect(presetEnabled('seller', box('phone'))).toBe(true)
  })

  it('bank keeps ID but hides account numbers', () => {
    expect(presetEnabled('bank', box('id_number'))).toBe(false)
    expect(presetEnabled('bank', box('account'))).toBe(true)
  })

  it('always redacts boxes the user drew', () => {
    expect(presetEnabled('seller', box('address', 'manual'))).toBe(true)
  })
})
