import type { Span } from '../types'

// TODO: PH-specific detectors (TIN, SSS, PhilHealth, UMID, mobile numbers, emails, accounts).
export function detectRegexPii(_text: string): Span[] {
  return []
}
