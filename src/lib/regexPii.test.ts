import { describe, expect, it } from 'vitest'
import { detectRegex, normalizeDigits } from './regexPii'
import type { PiiType } from '../types'

/** [matched text, type] pairs, in order. */
function found(text: string): [string, PiiType][] {
  return detectRegex(text).map((s) => [s.text, s.type])
}

function expectOnly(text: string, value: string, type: PiiType) {
  expect(found(text)).toEqual([[value, type]])
}

describe('PH mobile', () => {
  it('matches common formats', () => {
    expectOnly('Mobile: 0917 123 4567', '0917 123 4567', 'phone')
    expectOnly('Tel +63 917-123-4567.', '+63 917-123-4567', 'phone')
    expectOnly('call 09171234567 now', '09171234567', 'phone')
  })
  it('is not swallowed by a following amount', () => {
    expectOnly('Load 0917 123 4567 2,500.00', '0917 123 4567', 'phone')
  })
  it('tolerates OCR O/0 and l/1 swaps', () => {
    expectOnly('Mobile: O917 l23 4567', 'O917 l23 4567', 'phone')
  })
  it('rejects non-mobile prefixes and amounts', () => {
    expect(found('Ref 0817 123 4567x')).toEqual([])
    expect(found('Total 12,345.00 and 917,123.45')).toEqual([])
  })
})

describe('landline', () => {
  it('matches area-code formats', () => {
    expectOnly('Tel: (02) 8123 4567', '(02) 8123 4567', 'phone')
    expectOnly('Cebu office 032-234-5678', '032-234-5678', 'phone')
  })
  it('rejects numbers without an area code and amounts', () => {
    expect(found('Tel: 8123 4567')).toEqual([])
    expect(found('Balance 12,345.00')).toEqual([])
  })
})

describe('email', () => {
  it('matches addresses', () => {
    expectOnly('Email: juan.santos@example.com', 'juan.santos@example.com', 'email')
    expectOnly('<maria_b+tabon@mail.example.ph>', 'maria_b+tabon@mail.example.ph', 'email')
  })
  it('rejects incomplete addresses', () => {
    expect(found('juan.santos@example and @gmail.com')).toEqual([])
  })
})

describe('TIN', () => {
  it('matches 9 and 12 digit TINs', () => {
    expectOnly('TIN 123-456-789-000', '123-456-789-000', 'id_number')
    expectOnly('TIN: 123 456 789', '123 456 789', 'id_number')
    expectOnly('TIN 123-456-789-00000', '123-456-789-00000', 'id_number')
  })
  it('rejects short groups and comma amounts', () => {
    expect(found('Ref 123-456-78')).toEqual([])
    expect(found('Gross 123,456,789.00')).toEqual([])
  })
})

describe('SSS', () => {
  it('matches with dashes or spaces', () => {
    expectOnly('SSS No. 34-1234567-8', '34-1234567-8', 'id_number')
    expectOnly('SSS 34 1234567 8', '34 1234567 8', 'id_number')
  })
  it('rejects wrong group lengths', () => {
    expect(found('SSS 34-123456-8')).toEqual([])
  })
})

describe('PhilHealth', () => {
  it('matches, including OCR swaps', () => {
    expectOnly('PhilHealth 12-345678901-2', '12-345678901-2', 'id_number')
    expectOnly('PIN: 12-34567890l-2', '12-34567890l-2', 'id_number')
  })
  it('is not split into an SSS or phone match', () => {
    expect(detectRegex('PhilHealth 12-345678901-2')).toHaveLength(1)
  })
  it('rejects wrong group lengths', () => {
    expect(found('PIN 12-34567890-2')).toEqual([])
  })
})

describe('UMID CRN', () => {
  it('matches', () => {
    expectOnly('CRN 0028-1234567-8', '0028-1234567-8', 'id_number')
    expectOnly('CRN: 0111 2345678 9', '0111 2345678 9', 'id_number')
  })
  it('rejects wrong group lengths', () => {
    expect(found('CRN 0028-123456-8')).toEqual([])
  })
})

describe('Pag-IBIG MID', () => {
  it('matches as an ID number', () => {
    expectOnly('Pag-IBIG MID No. 1234-5678-9012', '1234-5678-9012', 'id_number')
    expectOnly('HDMF 1234 5678 9012', '1234 5678 9012', 'id_number')
  })
  it('is labelled an account when only account words are nearby', () => {
    expectOnly('Account Number 0123-4567-8901', '0123-4567-8901', 'account')
  })
  it('rejects short groups', () => {
    expect(found('MID 1234-5678-901')).toEqual([])
  })
})

describe('passport', () => {
  it('matches PH passport formats', () => {
    expectOnly('Passport No. P1234567A', 'P1234567A', 'id_number')
    expectOnly('Passport EB0123456', 'EB0123456', 'id_number')
  })
  it('rejects too many letters or digits missing', () => {
    expect(found('Code ABC1234567 and P123456')).toEqual([])
  })
})

describe("driver's license", () => {
  it('matches LTO format', () => {
    expectOnly('License No. N01-12-123456', 'N01-12-123456', 'id_number')
    expectOnly('DL D12-34-567890 exp', 'D12-34-567890', 'id_number')
  })
  it('rejects short last group', () => {
    expect(found('License N01-12-12345')).toEqual([])
  })
})

describe('card numbers (Luhn)', () => {
  it('matches valid card numbers', () => {
    expectOnly('Card 4111 1111 1111 1111', '4111 1111 1111 1111', 'account')
    expectOnly('Card: 5500-0000-0000-0004', '5500-0000-0000-0004', 'account')
  })
  it('rejects numbers that fail Luhn, without matching an ID inside them', () => {
    expect(found('Card 4111 1111 1111 1112')).toEqual([])
  })
})

describe('bank account (context)', () => {
  it('matches digit runs near account words', () => {
    expectOnly('Account No.: 3012-4455-67', '3012-4455-67', 'account')
    expectOnly('Acct 001234567890 (savings)', '001234567890', 'account')
    expectOnly('A/C 1234 5678 90', '1234 5678 90', 'account')
  })
  it('uses the label on the line above', () => {
    const accounts = detectRegex('CUSTOMER NAME ACCOUNT NO.\nJUAN MIGUEL DELA CRUZ SANTOS 3012-4455-67').filter((s) => s.type === 'account')
    expect(accounts.map((s) => s.text)).toEqual(['3012-4455-67'])
  })
  it('rejects runs without account words, and amounts', () => {
    expect(found('Reference 0012345678 issued')).toEqual([])
    expect(found('Account balance 12,345.00 and 1,234,567,890.00')).toEqual([])
  })
})

describe('date of birth (context)', () => {
  it('matches dates near birth words', () => {
    expectOnly('Date of Birth: 1992-03-14', '1992-03-14', 'date')
    expectOnly('Petsa ng Kapanganakan: March 14, 1992', 'March 14, 1992', 'date')
    expectOnly('DOB 14/03/1992', '14/03/1992', 'date')
  })
  it('ignores other dates', () => {
    expect(found('Date Issued: 2023-07-01')).toEqual([])
    expect(found('Period: 01 Sep 2026 - 30 Sep 2026')).toEqual([])
  })
})

describe('normalizeDigits', () => {
  it('keeps length and only touches mostly-numeric tokens', () => {
    const s = 'Blk 12 Lot 5 O917 l23 4567 SOLO'
    const n = normalizeDigits(s)
    expect(n).toHaveLength(s.length)
    expect(n).toBe('Blk 12 Lot 5 0917 123 4567 SOLO')
  })
})

// Real OCR output (PSM 6) from the fictional samples in public/samples.
describe('sample documents', () => {
  it('bank statement', () => {
    const text = `Bayan Savings Bank Period: 01 Sep 2026 — 30 Sep 2026
tatement of Account - Savings
ACCOUNT HOLDER ACCOUNT NUMBER
JUAN MIGUEL DELA CRUZ SANTOS 0123-4567-8901
MAILING ADDRESS
Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro, Angono, Rizal 1930
MOBILE EMAIL
0917 123 4567 juan.santos@example.com
Transaction History
DATE DESCRIPTION DEBIT CREDIT BALANCE
Opening Balance 48 250.75
02 Sep Payroll Credit - Halimbawa Tech 32,450.00 80,700.75
03 Sep ATM Withdrawal - Angono Branch 5,000.00 75,700.75
09 Sep Online Transfer to M. Reyes 2,500.00 70,016.15
28 Sep Interest Earned 18.42 97,058.22
Opening Balance PHP 48,250.75
Closing Balance PHP 97,058.22`
    expect(found(text)).toEqual([
      ['JUAN MIGUEL DELA CRUZ SANTOS', 'name'],
      ['0123-4567-8901', 'account'],
      ['Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro, Angono, Rizal 1930', 'address'],
      ['0917 123 4567', 'phone'],
      ['juan.santos@example.com', 'email'],
    ])
  })

  it('ID card', () => {
    const text = `REPUBLIC OF THE PHILIPPINES
CRN
0028-1234567-8
NAME
JUAN MIGUEL DELA CRUZ SANTOS
DATE OF BIRTH SEX
PHOTO 1992-03-14 M
ADDRESS
Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro,
Angono, Rizal 1930
Signature
Date Issued: 2023-07-01`
    expect(found(text)).toEqual([
      ['0028-1234567-8', 'id_number'],
      ['JUAN MIGUEL DELA CRUZ SANTOS', 'name'],
      ['1992-03-14', 'date'],
      ['Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro,\nAngono, Rizal 1930', 'address'],
    ])
  })

  it('payslip (simulated phone photo)', () => {
    const text = `PAYSLIP
Halimbawa Tech Inc. Pay Period: 01-15 Sep 2026
EMPLOYEE NAME EMPLOYEE NO.
JUAN MIGUEL DELA CRUZ SANTOS HT-2019-0457
POSITION TIN
Senior Software Engineer 123-456-789-000
SSS NO. PHILHEALTH NO.
34-1234567-8 12-345678901-2
PAG-IBIG MID NO. PAYROLL ACCOUNT
1234-5678-9012 0123-4567-8901
Basic Pay 35,000.00
Gross Pay 37,520.45
NET PAY PHP 32,451.00`
    const values = found(text).map(([v]) => v)
    expect(values).toEqual(['JUAN MIGUEL DELA CRUZ SANTOS', '123-456-789-000', '34-1234567-8', '12-345678901-2', '1234-5678-9012', '0123-4567-8901'])
  })

  it('utility bill', () => {
    const text = `Maliwanag Power Co.
CUSTOMER NAME ACCOUNT NO.
JUAN MIGUEL DELA CRUZ SANTOS 3012-4455-67
BILLING PERIOD METER NO:
Aug 28, 2026 — Sep 27, 2026 MPC-88214093
Previous Reading 14,208 kWh
TOTAL AMOUNT DUE PHP 3,184.60
Due Date: Oct 12, 2026`
    expect(found(text)).toEqual([
      ['JUAN MIGUEL DELA CRUZ SANTOS', 'name'],
      ['3012-4455-67', 'account'],
    ])
  })
})

describe('labeled address', () => {
  const addr = (text: string) => detectRegex(text).filter((s) => s.type === 'address').map((s) => s.text)

  it('takes the lines under an ADDRESS label, following trailing commas', () => {
    const text = 'PHOTO 1992-03-14 M\nas ADDRESS\nBlk 12 Lot 5 Sampaguita St., Brgy. San Isidro,\nAngono, Rizal 1930\nSignature'
    expect(addr(text)).toEqual(['Blk 12 Lot 5 Sampaguita St., Brgy. San Isidro,\nAngono, Rizal 1930'])
  })
  it('takes a value on the label line', () => {
    expect(addr('Mailing Address: 45 Mabini St., Marikina City 1805\nBasic Pay 25,000.00')).toEqual([
      '45 Mabini St., Marikina City 1805',
    ])
  })
  it('ignores a label followed by another label', () => {
    expect(addr('HOME ADDRESS\nMOBILE NO.')).toEqual([])
  })
})

describe('non-English text', () => {
  it('finds nothing in text with no PII and does not throw', () => {
    expect(found('')).toEqual([])
    expect(found('Ang bayan ko ay maganda. 日本語のテキスト Ñoño café')).toEqual([])
  })
  it('still finds a number next to non-English words', () => {
    expect(found('Numero ng telepono: 0917 123 4567 — salamat')).toEqual([['0917 123 4567', 'phone']])
  })
})

describe('labeled names', () => {
  const names = (text: string) => detectRegex(text).filter((s) => s.type === 'name').map((s) => s.text)

  it('PRC card: value after an arrow on the label line, however OCR reads the arrow', () => {
    const text = `Republic of the Philippines
PROFESSIONAL REGULATION COMMISSION
LAST NAME ▶ DELA PAZ
FIRST NAME > ANA LUISA
MIDDLE NAME » SORIANO
REGISTRATION NO. ▶ 0012345
REGISTRATION DATE ▶ 11/13/2019`
    expect(names(text)).toEqual(['DELA PAZ', 'ANA LUISA', 'SORIANO'])
    expect(found(text)).toContainEqual(['0012345', 'id_number'])
  })
  it('PRC card as read in the browser: arrows as "p>", label words run together', () => {
    const text = 'LAST NAME p> DELA PAZ\nREGISTRATIONNO. p> 0012345\nREGISTRATION DATE > 11/13/2019'
    expect(found(text)).toEqual([
      ['DELA PAZ', 'name'],
      ['0012345', 'id_number'],
    ])
  })
  it('passport: bilingual labels with the value on the next line', () => {
    const text = `Apelyido/Surname
DELA PAZ
Mga Pangalan/Given names
ANA LUISA
Panggitnang apelyido/Middle name
SORIANO
Petsa ng kapanganakan/Date of birth
14 MAR 1992`
    expect(names(text)).toEqual(['DELA PAZ', 'ANA LUISA', 'SORIANO'])
    expect(found(text)).toContainEqual(['14 MAR 1992', 'date'])
  })
  it('a header row of name labels takes the whole value row', () => {
    expect(names('LAST NAME FIRST NAME MIDDLE NAME\nDELA PAZ ANA LUISA SORIANO\nSEX M')).toEqual(['DELA PAZ ANA LUISA SORIANO'])
  })
  it('stops at the next column and at digits', () => {
    expect(names('CUSTOMER NAME ACCOUNT NO.\nJUAN DELA CRUZ 3012-4455-67')).toEqual(['JUAN DELA CRUZ'])
    expect(names('Name: Maria dela Cruz Date: 2026-01-01')).toEqual(['Maria dela Cruz'])
  })
  it('ignores labels with no name after them', () => {
    expect(names('NAME\nDATE OF BIRTH')).toEqual([])
    expect(names('Name of company')).toEqual([])
    expect(names('NAME\n0917 123 4567')).toEqual([])
  })
})

describe('passport MRZ', () => {
  it('boxes both machine-readable lines', () => {
    const text = 'P<PHLDELA<PAZ<<ANA<LUISA<<<<<<<<<<<<<<<<<<<\nP1234567A8PHL9203145F3001012<<<<<<<<<<<<<<04'
    expect(found(text)).toEqual([
      ['P<PHLDELA<PAZ<<ANA<LUISA<<<<<<<<<<<<<<<<<<<', 'name'],
      ['P1234567A8PHL9203145F3001012<<<<<<<<<<<<<<04', 'id_number'],
    ])
  })
})
