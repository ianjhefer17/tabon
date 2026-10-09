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
- @mlc-ai/web-llm (in-browser LLM on WebGPU, runs in a Web Worker)
- Qwen2.5-3B-Instruct (default, Qwen Research License) and Qwen2.5-1.5B-Instruct (Lite, Apache-2.0) by the Qwen team, Alibaba Cloud, in MLC q4f16_1 builds (q4f32_1 on GPUs without f16). Weights download once from huggingface.co/mlc-ai and the WebGPU kernels from raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs, then stay in the browser's IndexedDB.
- pdfjs-dist (PDF rendering), with its worker, CMaps, standard fonts (Foxit, Liberation Sans) and image-decoder wasm (OpenJPEG, JBIG2, QCMS) self-hosted under `public/pdfjs/`
- vite-plugin-pwa (Workbox service worker that precaches the app, OCR files and samples; web app manifest)
- rsvg-convert (librsvg; rendered the shield icon `public/favicon.svg` to `icon-192.png` / `icon-512.png`)
- oxlint (linting), vitest (unit tests)
- Python + Pillow (generating fictional sample documents)
- Claude Code (AI coding assistant used during development)

## Offline assets

`npm install` runs `scripts/copy-assets.mjs` (postinstall), which copies the Tesseract worker and core files into `public/tesseract/` and the pdf.js worker and data into `public/pdfjs/`. The app never loads OCR or PDF code or data from a CDN, and the service worker precaches all of it (plus `/samples/**` and the app shell) so the app works offline after the first visit.

The header chip turns green ("Offline-ready · 0 bytes sent") once the OCR files are in the service-worker cache and the AI model is stored on the device, and shows whether the browser is currently Online or Offline. The Privacy link explains how to check this in DevTools.

Regenerate the app icons after editing `public/favicon.svg`:

```
rsvg-convert -w 192 -h 192 public/favicon.svg -o public/icon-192.png
rsvg-convert -w 512 -h 512 public/favicon.svg -o public/icon-512.png
```

## AI model

On first visit the app downloads the AI model in the background (Standard 1.7 GB, Lite 0.9 GB; switch in the side panel). After that it loads from the browser's storage with no network. Without WebGPU the app falls back to rule-based detection only.

For a demo machine with little free disk, a Chrome profile on an external drive keeps the model there:

```
open -na "Google Chrome" --args --user-data-dir=/Volumes/T7/tabon-chrome-profile
```

## Sample documents

`public/samples/` holds FICTIONAL documents (invented people, numbers, addresses and companies), all watermarked "SAMPLE — FICTIONAL DATA". Regenerate them with:

```
python3 -m venv .venv && .venv/bin/pip install pillow
.venv/bin/python scripts/make_samples.py
```
