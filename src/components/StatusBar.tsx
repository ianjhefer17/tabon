interface StatusBarProps {
  message: string
  /** Right-aligned extra info, e.g. stage timings. */
  detail?: string
}

export function StatusBar({ message, detail }: StatusBarProps) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-gray-800 px-6 py-2 text-xs text-gray-400">
      <span>{message}</span>
      {detail && <span className="tabular-nums text-gray-500">{detail}</span>}
    </footer>
  )
}
