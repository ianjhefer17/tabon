import { useState } from 'react'
import { DropZone } from './components/DropZone'
import { Header } from './components/Header'
import { SampleRow } from './components/SampleRow'
import { SidePanel } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import type { Box } from './types'

function App() {
  const [boxes] = useState<Box[]>([])
  const [status, setStatus] = useState('Ready. Drop a document to begin.')

  const handleFile = (file: File) => setStatus(`Loaded ${file.name}`)

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <Header />
      <div className="flex flex-1 flex-col md:flex-row">
        <main className="flex flex-1 flex-col p-6">
          <DropZone onFile={handleFile} />
          <SampleRow onFile={handleFile} />
        </main>
        <SidePanel boxes={boxes} />
      </div>
      <StatusBar message={status} />
    </div>
  )
}

export default App
