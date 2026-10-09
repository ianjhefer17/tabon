import type { PiiSource, PiiType } from '../types'

export const TYPE_COLOR: Record<PiiType, string> = {
  name: '#8b5cf6', // violet
  address: '#f59e0b', // amber
  id_number: '#ef4444', // red
  phone: '#3b82f6', // blue
  email: '#06b6d4', // cyan
  account: '#22c55e', // green
  date: '#ec4899', // pink
  other: '#9ca3af', // gray
}

export const TYPE_LABEL: Record<PiiType, string> = {
  name: 'Name',
  address: 'Address',
  id_number: 'ID number',
  phone: 'Phone',
  email: 'Email',
  account: 'Account',
  date: 'Date',
  other: 'Other',
}

export const SOURCE_LABEL: Record<PiiSource, string> = { regex: 'Rule', llm: 'AI', manual: 'You' }

/** Partially masks detected text for the side panel: "0917 123 4567" → "0917 •••• 567". */
export function maskText(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= 6) return `${t.slice(0, 1)}••••`
  const head = Math.min(4, Math.floor(t.length / 3))
  return `${t.slice(0, head).trimEnd()} •••• ${t.slice(-3).trimStart()}`
}
