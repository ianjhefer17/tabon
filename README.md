# Tabon — Private Document Redactor

Redact personal info from document images and PDFs, entirely in your browser. Nothing leaves your device. Review before sharing.

## Development

```
npm install
npm run dev
npm run build
npm run preview
```

## Disclosures

- Vite, React, TypeScript, Tailwind CSS
- tesseract.js (in-browser OCR)
- @mlc-ai/web-llm (in-browser LLM on WebGPU), models Qwen2.5-3B-Instruct-q4f16_1-MLC (fallback Qwen2.5-1.5B-Instruct-q4f16_1-MLC)
- pdfjs-dist (PDF rendering)
- vite-plugin-pwa (offline caching)
- oxlint (linting)
- Claude Code (AI coding assistant used during development)
