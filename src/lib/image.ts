/** Anything we draw from: a decoded photo, a rendered PDF page, or an <img>. */
export type ImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap

/** OCR never runs on more than this many pixels (huge photos are slow and can exceed canvas limits, e.g. iOS ~16 MP). */
export const MAX_OCR_PIXELS = 12_000_000
/** OCR never runs wider than this; 6000px phone photos are downscaled (export still uses the original). */
export const MAX_OCR_WIDTH = 3000

export function sourceSize(src: ImageSource): { width: number; height: number } {
  if (src instanceof HTMLImageElement) return { width: src.naturalWidth, height: src.naturalHeight }
  return { width: src.width, height: src.height }
}

/** Scale for the OCR canvas: upscale small images to minWidth, downscale huge ones to the width and pixel caps. */
export function ocrScale(width: number, height: number, minWidth: number): number {
  let scale = Math.max(1, minWidth / width)
  scale = Math.min(scale, MAX_OCR_WIDTH / Math.max(width, 1))
  scale = Math.min(scale, Math.sqrt(MAX_OCR_PIXELS / Math.max(width * height, 1)))
  return scale
}

/** PNG/JPG by MIME type, or by extension when the browser gives no type. */
export function isSupportedImage(file: File): boolean {
  if (file.type === 'image/png' || file.type === 'image/jpeg') return true
  return !file.type && /\.(png|jpe?g)$/i.test(file.name)
}

/**
 * Decodes a photo upright: phone cameras store sideways pixels plus an EXIF rotation flag,
 * and OCR/export must see the image the way the user does.
 */
export async function decodeImage(file: Blob): Promise<ImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older browsers without the options argument: fall through to <img>, which also applies EXIF.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}
