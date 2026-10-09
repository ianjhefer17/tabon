import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Caches the app, OCR and PDF assets for offline use. With registerType 'autoUpdate',
// the page reloads once a newly deployed version takes control, so a stale build is never shown.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
