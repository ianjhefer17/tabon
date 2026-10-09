import { useState } from 'react'
import { DropZone } from './components/DropZone'
import { Header } from './components/Header'
import { SidePanel } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import type { Box } from './types'

function App() {
  const [boxes] = useState<Box[]>([])
  const [status, setStatus] = useState('Ready. Drop a document to begin.')

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <Header />
      <div className="flex flex-1 flex-col md:flex-row">
        <main className="flex-1 p-6">
          <DropZone onFile={(file) => setStatus(`Loaded ${file.name}`)} />
        </main>
        <SidePanel boxes={boxes} />
      </div>
      <StatusBar message={status} />
    </div>
  )
}

export default App
