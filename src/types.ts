export interface BBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Word {
  text: string
  bbox: BBox
  charStart: number
  charEnd: number
}

export type PiiType =
  | 'name'
  | 'address'
  | 'id_number'
  | 'phone'
  | 'email'
  | 'account'
  | 'date'
  | 'other'

export type PiiSource = 'regex' | 'llm'

export interface Span {
  start: number
  end: number
  type: PiiType
  source: PiiSource
  text: string
}

export interface Box {
  id: string
  type: PiiType
  source: PiiSource
  bbox: BBox
  enabled: boolean
}
