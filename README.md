# Tabon — Private Document Redactor

Redact personal info from document images and PDFs, entirely in your browser. Nothing leaves your device. Review before sharing.

## Development

```
npm install
npm run dev
npm run build
npm run preview
npm test
```

## Disclosures

- Vite, React, TypeScript, Tailwind CSS
- tesseract.js + tesseract.js-core (in-browser OCR, WebAssembly), self-hosted under `public/tesseract/`
- Tesseract `eng.traineddata` from tesseract-ocr/tessdata_fast (Apache-2.0), gzipped at `public/tesseract/lang/eng.traineddata.gz`
- @mlc-ai/web-llm (in-browser LLM on WebGPU), models Qwen2.5-3B-Instruct-q4f16_1-MLC (fallback Qwen2.5-1.5B-Instruct-q4f16_1-MLC)
- pdfjs-dist (PDF rendering), with its worker, CMaps, standard fonts (Foxit, Liberation Sans) and image-decoder wasm (OpenJPEG, JBIG2, QCMS) self-hosted under `public/pdfjs/`
- vite-plugin-pwa (offline caching)
- oxlint (linting), vitest (unit tests)
- Python + Pillow (generating fictional sample documents)
- Claude Code (AI coding assistant used during development)

## Offline assets

`npm install` runs `scripts/copy-assets.mjs` (postinstall), which copies the Tesseract worker and core files into `public/tesseract/` and the pdf.js worker and data into `public/pdfjs/`. The app never loads OCR or PDF code or data from a CDN, and the service worker caches all of it so the app works offline after the first visit.

## Sample documents

`public/samples/` holds FICTIONAL documents (invented people, numbers, addresses and companies), all watermarked "SAMPLE — FICTIONAL DATA". Regenerate them with:

```
python3 -m venv .venv && .venv/bin/pip install pillow
.venv/bin/python scripts/make_samples.py
```
