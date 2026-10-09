# Tabon — Private Document Redactor
AppBuildersPH Hackathon 2026, theme: Local AI. Code freeze 10:00 AM Oct 10 (Asia/Manila).

## What it does
User drops an image (PNG/JPG) or PDF page of a personal document (ID, payslip, bank statement, bill). Tabon OCRs it in the browser, detects personal info (PII) with regex + a local LLM, draws boxes, lets the user toggle boxes, and exports a flattened redacted PNG. Nothing ever leaves the device.

## Hard rules (hackathon compliance — never break these)
1. ALL AI inference runs in the browser: Tesseract.js (OCR) + WebLLM (LLM on WebGPU). NO cloud AI APIs (no OpenAI, Anthropic, Gemini, HF Inference, etc.).
2. The app must work with Wi-Fi OFF after first load. The only network fetches ever allowed are first-time downloads of app assets and model weights, which must then be cached.
3. Self-host Tesseract worker/core/language data and pdf.js worker under /public. No runtime CDN dependencies.
4. Never send document text, images, or analytics anywhere. No telemetry, no trackers.
5. Every model, library, and tool used must be listed in README.md under 'Disclosures'.
6. Sample documents must be FICTIONAL (invented names, numbers, addresses) and watermarked SAMPLE.

## Stack
Vite + React + TypeScript, Tailwind CSS, tesseract.js, @mlc-ai/web-llm (model Qwen2.5-3B-Instruct-q4f16_1-MLC, fallback Qwen2.5-1.5B-Instruct-q4f16_1-MLC), pdfjs-dist, vite-plugin-pwa.

## Architecture
src/lib/ocr.ts        -> OCR, returns words[] {text, bbox{x0,y0,x1,y1}, charStart, charEnd} + fullText
src/lib/pdf.ts        -> renders PDF pages to a canvas with self-hosted pdf.js
src/lib/regexPii.ts   -> PH-specific regex detectors, returns spans {start,end,type,source:'regex'}
src/lib/llmPii.ts     -> WebLLM in a Web Worker, returns spans from exact substrings
src/lib/match.ts      -> maps character spans -> word boxes, merges + dedupes
src/lib/redact.ts     -> draws final black boxes on full-res canvas, exports PNG
src/components/*      -> UI

## Working style
- Small, working increments. After each task: run `npm run build`, fix all TypeScript errors, then git commit with a clear message.
- Prefer simple code over clever code. No backend. No login.
- Never claim 'safe' or 'guaranteed'; UI says 'Review before sharing'.
