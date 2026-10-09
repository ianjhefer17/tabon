import type { Box, PiiType } from '../types'

export type PresetKey = 'everything' | 'landlord' | 'employer' | 'seller' | 'bank'

export interface Preset {
  label: string
  /** One line under the selector explaining the defaults. */
  reason: string
  /** Types left visible by default. Every other type is redacted. */
  keep: PiiType[]
}

export const PRESETS: Record<PresetKey, Preset> = {
  everything: {
    label: 'Everything (hide all)',
    reason: 'Every detection is redacted. Untick anything the recipient needs.',
    keep: [],
  },
  landlord: {
    label: 'Landlord / Rental',
    reason: 'Landlords need your name, not your ID numbers.',
    keep: ['name'],
  },
  employer: {
    label: 'Employer / HR',
    reason: 'HR needs your name and how to reach you, not your bank details.',
    keep: ['name', 'phone', 'email'],
  },
  seller: {
    label: 'Online seller / Marketplace',
    reason: 'Sellers need your name and address to deliver, nothing else.',
    keep: ['name', 'address'],
  },
  bank: {
    label: 'Loan / Bank',
    reason: 'Lenders need your name and ID, not your other accounts.',
    keep: ['name', 'id_number'],
  },
}

export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[]

/** Default redaction for a box under a preset. Boxes the user drew are always redacted. */
export function presetEnabled(key: PresetKey, box: Pick<Box, 'type' | 'source'>): boolean {
  return box.source === 'manual' || !PRESETS[key].keep.includes(box.type)
}

/** Resets every box to the preset's default (used for new detections and when switching preset). */
export function applyPreset(boxes: Box[], key: PresetKey): Box[] {
  return boxes.map((b) => ({ ...b, enabled: presetEnabled(key, b) }))
}
