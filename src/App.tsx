import { useEffect, useRef, useState } from 'react'
import { DocumentView } from './components/DocumentView'
import { DropZone } from './components/DropZone'
import { Header } from './components/Header'
import { SampleRow } from './components/SampleRow'
import { SidePanel } from './components/SidePanel'
import { StatusBar } from './components/StatusBar'
import { runOcr } from './lib/ocr'
import type { Box, Word } from './types'

interface LoadedDoc {
  url: string
  name: string
  width: number
  height: number
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

function App() {
  const [boxes] = useState<Box[]>([])
  const [doc, setDoc] = useState<LoadedDoc | null>(null)
  const [words, setWords] = useState<Word[]>([])
  const [status, setStatus] = useState('Ready. Drop a document to begin.')
  const runId = useRef(0)

  // Release the previous object URL when the document changes.
  useEffect(() => () => {
    if (doc) URL.revokeObjectURL(doc.url)
  }, [doc])

  const handleFile = async (file: File) => {
    if (file.type === 'application/pdf') {
      setStatus('PDF support is coming soon. Please use a PNG or JPG for now.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setStatus(`Unsupported file type: ${file.type || file.name}`)
      return
    }

    const id = ++runId.current
    const url = URL.createObjectURL(file)
    try {
      const img = await loadImage(url)
      if (id !== runId.current) return
      setDoc({ url, name: file.name, width: img.naturalWidth, height: img.naturalHeight })
      setWords([])
      setStatus(`Reading text from ${file.name}… 0%`)

      const result = await runOcr(img, (percent, step) => {
        if (id === runId.current) setStatus(`Reading text from ${file.name}… ${percent}% (${step})`)
      })
      if (id !== runId.current) return
      setWords(result.words)
      setStatus(`Found ${result.words.length} words in ${file.name}. Review before sharing.`)
    } catch (err) {
      if (id !== runId.current) return
      console.error(err)
      setStatus(`Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const clear = () => {
    runId.current++
    setDoc(null)
    setWords([])
    setStatus('Ready. Drop a document to begin.')
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-gray-100">
      <Header />
      <div className="flex flex-1 flex-col md:flex-row">
        <main className="flex flex-1 flex-col p-6">
          {doc ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="truncate text-sm text-gray-300">{doc.name}</span>
                <button type="button" onClick={clear} className="rounded-md border border-gray-700 px-3 py-1 text-sm hover:border-gray-500">
                  New document
                </button>
              </div>
              <DocumentView src={doc.url} width={doc.width} height={doc.height} words={words} />
            </div>
          ) : (
            <DropZone onFile={handleFile} />
          )}
          <SampleRow onFile={handleFile} />
        </main>
        <SidePanel boxes={boxes} />
      </div>
      <StatusBar message={status} />
    </div>
  )
}

export default App
