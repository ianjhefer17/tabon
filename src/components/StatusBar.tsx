interface StatusBarProps {
  message: string
}

export function StatusBar({ message }: StatusBarProps) {
  return (
    <footer className="border-t border-gray-800 px-6 py-2 text-xs text-gray-400">{message}</footer>
  )
}
