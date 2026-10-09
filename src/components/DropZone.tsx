import { useRef, useState } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
}

const ACCEPT = 'image/png,image/jpeg,application/pdf'

export function DropZone({ onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex h-full min-h-80 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? 'border-amber-400 bg-amber-400/10' : 'border-gray-700 hover:border-gray-500'
      }`}
    >
      <p className="text-lg font-medium">Drop a document here</p>
      <p className="mt-2 text-sm text-gray-400">PNG, JPG or PDF · nothing leaves your device</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
