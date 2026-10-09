import { describe, expect, it } from 'vitest'
import { MAX_OCR_PIXELS, MAX_OCR_WIDTH, isSupportedImage, ocrScale } from './image'

describe('ocrScale', () => {
  it('upscales a small 400px image to the minimum width', () => {
    expect(400 * ocrScale(400, 300, 2000)).toBeCloseTo(2000)
  })
  it('leaves a mid-size image alone', () => {
    expect(ocrScale(2400, 1600, 2000)).toBe(1)
  })
  it('downscales a 6000px photo for OCR', () => {
    const s = ocrScale(6000, 4000, 2000)
    expect(6000 * s).toBeLessThanOrEqual(MAX_OCR_WIDTH)
    expect(6000 * 4000 * s * s).toBeLessThanOrEqual(MAX_OCR_PIXELS + 1)
  })
  it('caps pixels for a tall image even when it would be upscaled', () => {
    const s = ocrScale(400, 20000, 2000)
    expect(400 * 20000 * s * s).toBeLessThanOrEqual(MAX_OCR_PIXELS + 1)
  })
})

describe('isSupportedImage', () => {
  const file = (name: string, type: string) => new File([''], name, { type })
  it('accepts PNG/JPG by type or, without a type, by extension', () => {
    expect(isSupportedImage(file('a.png', 'image/png'))).toBe(true)
    expect(isSupportedImage(file('photo.JPEG', ''))).toBe(true)
  })
  it('rejects other images', () => {
    expect(isSupportedImage(file('photo.heic', 'image/heic'))).toBe(false)
    expect(isSupportedImage(file('notes.txt', ''))).toBe(false)
  })
})
