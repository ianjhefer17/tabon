interface SampleRowProps {
  onFile: (file: File) => void
}

export const SAMPLES = [
  { file: 'id_card.png', label: 'ID card' },
  { file: 'bank_statement.png', label: 'Bank statement' },
  { file: 'payslip.png', label: 'Payslip' },
  { file: 'utility_bill.png', label: 'Utility bill' },
]

const BASE = `${import.meta.env.BASE_URL}samples/`

// Samples are app assets (same origin, precached by the service worker).
export async function loadSample(name: string): Promise<File> {
  const res = await fetch(BASE + name)
  if (!res.ok) throw new Error(`Could not load sample ${name}`)
  const blob = await res.blob()
  return new File([blob], name, { type: blob.type || 'image/png' })
}

export function SampleRow({ onFile }: SampleRowProps) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">Try a sample</h2>
      <p className="text-xs text-gray-500">Fictional documents, watermarked SAMPLE.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SAMPLES.map((s) => (
          <button
            key={s.file}
            type="button"
            onClick={() => loadSample(s.file).then(onFile).catch((e) => console.error(e))}
            className="group overflow-hidden rounded-lg border border-gray-800 bg-gray-900 text-left hover:border-amber-400 focus:border-amber-400 focus:outline-none"
          >
            <div className="h-28 overflow-hidden bg-white">
              <img src={`${BASE}thumbs/${s.file}`} alt={s.label} className="w-full object-cover object-top" />
            </div>
            <span className="block px-3 py-2 text-sm text-gray-200 group-hover:text-amber-300">{s.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
