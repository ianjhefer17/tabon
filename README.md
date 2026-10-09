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
- Python + Pillow (generating fictional sample documents)
- Claude Code (AI coding assistant used during development)

## Sample documents

`public/samples/` holds FICTIONAL documents (invented people, numbers, addresses and companies), all watermarked "SAMPLE — FICTIONAL DATA". Regenerate them with:

```
python3 -m venv .venv && .venv/bin/pip install pillow
.venv/bin/python scripts/make_samples.py
```
