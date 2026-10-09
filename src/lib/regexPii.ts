import type { PiiType, Span } from '../types'

// Philippine PII detectors over OCR text. Returns character spans into the ORIGINAL text.
//
// OCR swaps: digit-based detectors run on a same-length copy of the text in which O/o→0 and
// l/I/|→1 are replaced only inside tokens that are already mostly digits ("O917" → "0917"),
// so words are never altered and every offset still points into the original text.
//
// Priority: detectors run most-specific first; a later match that overlaps an accepted span is dropped.

/** Separator inside ID numbers: a dash (any dash OCR may produce) with optional spaces, or one space. */
const SEP = String.raw`(?:[ \t]?[-‐‑–—][ \t]?|[ \t])`
/** Optional separator for phone numbers. */
const PSEP = String.raw`(?:[ \t]?[-‐‑–—][ \t]?|[ \t])?`
/** No letter or digit directly before / after a match. */
const B = String.raw`(?<![0-9A-Za-z])`
const E = String.raw`(?![0-9A-Za-z])`

const DASH = /[-‐‑–—]/

/**
 * False if the match is only part of a longer grouped number, e.g. "4111 1111 1111" inside
 * "4111 1111 1111 1112". Continuation uses the match's own separator style, so a dashed number
 * followed by a space and another number ("1234-5678-9012 0123-4567-8901") is still separate.
 * A following amount ("0917 123 4567 2,500.00") is not a continuation.
 */
function isolated(text: string, start: number, end: number): boolean {
  const m = text.slice(start, end)
  const inner = m.replace(/^\+/, '')
  const sep = DASH.test(inner) ? String.raw`[ \t]?[-‐‑–—][ \t]?` : /[ \t]/.test(inner) ? String.raw`[ \t]` : null
  if (!sep) return true
  const after = new RegExp(String.raw`^${sep}\d+(?!\d|[.,]\d)`)
  const before = new RegExp(String.raw`(?<![\d.,])\d+${sep}$`)
  return !after.test(text.slice(end, end + 30)) && !before.test(text.slice(Math.max(0, start - 30), start))
}

const SWAP_TO_DIGIT: Record<string, string> = { O: '0', o: '0', l: '1', I: '1', '|': '1' }

/** Same-length copy with OCR letter/digit confusions fixed inside mostly-numeric tokens. */
export function normalizeDigits(text: string): string {
  return text.replace(/[0-9OolI|]+/g, (tok) => {
    const digits = tok.replace(/\D/g, '').length
    if (digits === 0 || digits * 2 < tok.length) return tok
    return tok.replace(/[OolI|]/g, (c) => SWAP_TO_DIGIT[c])
  })
}

const ACCOUNT_WORDS = /\b(?:accounts?|acct|acc\.?\s*no|a\/c)\b/i
const PAGIBIG_WORDS = /\b(?:pag-?ibig|hdmf|mid)\b/i
const BIRTH_WORDS = /\b(?:birth|dob|d\.o\.b|born|kapanganakan)\b/i
const CONTEXT_CHARS = 40

/**
 * True if `words` occurs shortly before or after the match. "Before" is CONTEXT_CHARS, or back to
 * the start of the previous line if that is further: forms put labels on the line above, and OCR
 * reads two-column rows across ("CUSTOMER NAME ACCOUNT NO." over "JUAN ... SANTOS 3012-4455-67").
 */
function near(text: string, start: number, end: number, words: RegExp): boolean {
  const lineStart = text.lastIndexOf('\n', start - 1)
  const prevLineStart = lineStart <= 0 ? 0 : text.lastIndexOf('\n', lineStart - 1) + 1
  const before = text.slice(Math.max(0, Math.min(start - CONTEXT_CHARS, prevLineStart)), start)
  const after = text.slice(end, end + 15)
  return words.test(before) || words.test(after)
}

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

interface Candidate {
  start: number
  end: number
  type: PiiType
}

interface Detector {
  name: string
  /** 'norm' = run on the digit-normalized copy, 'raw' = run on the original text. */
  on: 'norm' | 'raw'
  find(text: string, raw: string): Candidate[]
}

/** Detector from a single regex; `classify` may change the type or reject (return null) a match. */
function pattern(
  name: string,
  on: 'norm' | 'raw',
  source: string,
  type: PiiType,
  flags = 'g',
  classify?: (m: RegExpExecArray, raw: string) => PiiType | null,
): Detector {
  return {
    name,
    on,
    find(text, raw) {
      const out: Candidate[] = []
      for (const m of text.matchAll(new RegExp(source, flags))) {
        if (on === 'norm' && !isolated(text, m.index, m.index + m[0].length)) continue
        const t = classify ? classify(m, raw) : type
        if (t) out.push({ start: m.index, end: m.index + m[0].length, type: t })
      }
      return out
    },
  }
}

/**
 * Digit runs whose groups are joined by a dash or a single space (a space only when the next
 * group is not the start of an amount, so "8901 2,500.00" does not join). If a run is too long, its space-separated pieces
 * are tried on their own, so "1234-5678-9012 0123-4567-8901" yields two numbers, not one.
 */
function digitRuns(text: string, minDigits: number, maxDigits: number): { start: number; end: number; digits: string }[] {
  const out: { start: number; end: number; digits: string }[] = []
  const run = /(?<![0-9A-Za-z.,])\d+(?:(?:[ \t]?[-‐‑–—][ \t]?|[ \t](?=\d+(?!\d|[.,]\d)))\d+)*(?![0-9A-Za-z]|[.,]\d)/g
  for (const m of text.matchAll(run)) {
    const pieces = [{ start: m.index, s: m[0] }]
    const total = m[0].replace(/\D/g, '').length
    if (total > maxDigits) {
      pieces.length = 0
      for (const p of m[0].matchAll(/\S+/g)) pieces.push({ start: m.index + p.index, s: p[0] })
    }
    for (const p of pieces) {
      const digits = p.s.replace(/\D/g, '')
      if (digits.length >= minDigits && digits.length <= maxDigits) {
        out.push({ start: p.start, end: p.start + p.s.length, digits })
      }
    }
  }
  return out
}

const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`
const DATE = [
  String.raw`(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])`, // 1992-03-14
  String.raw`(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|[12]\d|3[01])[-/.](?:19|20)\d{2}`, // 03/14/1992, 14/03/1992
  String.raw`${MONTH}[ \t]+(?:0?[1-9]|[12]\d|3[01]),?[ \t]+(?:19|20)\d{2}`, // March 14, 1992
  String.raw`(?:0?[1-9]|[12]\d|3[01])[ \t]+${MONTH},?[ \t]+(?:19|20)\d{2}`, // 14 Mar 1992
].join('|')

/**
 * Addresses after an "Address" label ("ADDRESS", "Mailing Address:", ...): the rest of the label's
 * line, or the next line if the label stands alone, plus up to two more lines while a line ends
 * with a comma ("Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro," / "Angono, Rizal 1930").
 * A backstop for the AI, which sometimes skips the address on ID cards.
 */
function addresses(raw: string): Candidate[] {
  const out: Candidate[] = []
  const lines: { start: number; text: string }[] = []
  let pos = 0
  for (const text of raw.split('\n')) {
    lines.push({ start: pos, text })
    pos += text.length + 1
  }
  lines.forEach((line, i) => {
    const label = /\baddress\b:?/i.exec(line.text)
    if (!label) return
    const restStart = label.index + label[0].length
    let j = i
    let start = line.start + restStart + (line.text.slice(restStart).length - line.text.slice(restStart).trimStart().length)
    if (!line.text.slice(restStart).trim()) {
      j = i + 1
      if (j >= lines.length) return
      start = lines[j].start + (lines[j].text.length - lines[j].text.trimStart().length)
    }
    while (j < i + 3 && j + 1 < lines.length && lines[j].text.trimEnd().endsWith(',')) j++
    const end = lines[j].start + lines[j].text.trimEnd().length
    const value = raw.slice(start, end)
    // Must look like an address, not another label: a digit or a comma.
    if (end > start && /[\d,]/.test(value)) out.push({ start, end, type: 'address' })
  })
  return out
}

// Most specific first.
const DETECTORS: Detector[] = [
  pattern('email', 'raw', String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}`, 'email'),
  {
    name: 'card',
    on: 'norm',
    find: (text) =>
      digitRuns(text, 13, 19)
        .filter((r) => luhn(r.digits))
        .map((r) => ({ start: r.start, end: r.end, type: 'account' as const })),
  },
  pattern('drivers_license', 'raw', String.raw`${B}[A-Z]\d{2}-\d{2}-\d{6}${E}`, 'id_number'),
  pattern('passport', 'raw', String.raw`\b[A-Z]{1,2}\d{7}[A-Z]?\b`, 'id_number'),
  pattern('philhealth', 'norm', String.raw`${B}\d{2}${SEP}\d{9}${SEP}\d${E}`, 'id_number'),
  pattern('umid_crn', 'norm', String.raw`${B}\d{4}${SEP}\d{7}${SEP}\d${E}`, 'id_number'),
  // Same 4-4-4 shape as many bank account numbers: label it by the nearby words.
  pattern('pagibig_mid', 'norm', String.raw`${B}\d{4}${SEP}\d{4}${SEP}\d{4}${E}`, 'id_number', 'g', (m, raw) => {
    const end = m.index + m[0].length
    const isAccount = near(raw, m.index, end, ACCOUNT_WORDS) && !near(raw, m.index, end, PAGIBIG_WORDS)
    return isAccount ? 'account' : 'id_number'
  }),
  pattern('tin', 'norm', String.raw`${B}\d{3}${SEP}\d{3}${SEP}\d{3}(?:${SEP}\d{3,5})?${E}`, 'id_number'),
  pattern('sss', 'norm', String.raw`${B}\d{2}${SEP}\d{7}${SEP}\d${E}`, 'id_number'),
  pattern('mobile', 'norm', String.raw`(?<![0-9A-Za-z+])(?:\+63${PSEP}|0)9\d{2}${PSEP}\d{3}${PSEP}\d{4}${E}`, 'phone'),
  pattern('landline', 'norm', String.raw`(?<![0-9A-Za-z(])(?:\(0[2-8]\d?\)|0[2-8]\d?)${PSEP}\d{3,4}${PSEP}\d{4}${E}`, 'phone'),
  {
    name: 'bank_account',
    on: 'norm',
    find: (text, raw) =>
      digitRuns(text, 10, 16)
        .filter((r) => near(raw, r.start, r.end, ACCOUNT_WORDS))
        .map((r) => ({ start: r.start, end: r.end, type: 'account' as const })),
  },
  pattern('dob', 'norm', `${B}(?:${DATE})${E}`, 'date', 'gi', (m, raw) =>
    near(raw, m.index, m.index + m[0].length, BIRTH_WORDS) ? 'date' : null,
  ),
  { name: 'address', on: 'raw', find: (_text, raw) => addresses(raw) },
]

export function detectRegex(fullText: string): Span[] {
  const norm = normalizeDigits(fullText)
  const accepted: Span[] = []
  for (const det of DETECTORS) {
    for (const c of det.find(det.on === 'norm' ? norm : fullText, fullText)) {
      if (accepted.some((s) => c.start < s.end && s.start < c.end)) continue
      accepted.push({ start: c.start, end: c.end, type: c.type, source: 'regex', text: fullText.slice(c.start, c.end) })
    }
  }
  return accepted.sort((a, b) => a.start - b.start)
}
