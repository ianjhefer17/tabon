# Tabon: judge Q&A cheat sheet

Short answers first, detail after. Never say "safe" or "guaranteed". Say "Review before sharing".

---

### What if OCR misses something?

**Then Tabon can't detect it, so the human always has the last word.** We never present the result as final: every box can be toggled off, and "Draw box" covers anything missed. The UI says "Review before sharing" for this reason.

- OCR struggles with blurry, dark, angled or low-res photos, handwriting and unusual fonts. We fix EXIF rotation and rescale very small and very large images before OCR to cut down misses.
- Export is a flattened image, so whatever *is* boxed is actually gone from the pixels, not hidden under a removable layer.

### Why not just regex?

**Regex is great for numbers with a fixed format and useless for everything else.** We use both.

- Rules (regex + checks) catch PH IDs reliably and instantly: TIN, SSS, PhilHealth, Pag-IBIG, mobile numbers, account numbers. They show up within seconds, even without a GPU.
- Names, home addresses, birthdays and employer names have no fixed format. "Juan Dela Cruz" and "Blk 5 Lot 12" don't match a pattern. That's what the local LLM is for.
- The LLM can only return exact substrings of the OCR text, which we map back to word boxes. It can't invent a box somewhere that has no text.

### Why not a cloud model?

**You can't protect a document by uploading it.** A cloud redactor needs the exact data you're trying to hide, sent to a server you have to trust, before it can tell you what to hide.

- Local also means: works offline, ₱0 per document, no API key, no account, no rate limits.
- Trade-off we accept: a 3B local model is less capable than a frontier cloud model. We close the gap with PH-specific rules and human review.

### How do you know nothing is uploaded?

**You don't have to trust us. You can check it.**

- Open DevTools → Network, turn Wi-Fi off, and run a document. It works, and nothing goes out. That's the live demo.
- No backend exists: the app is static files. There is no analytics, no telemetry, no tracker in the code.
- Tesseract worker/core/language data and the pdf.js worker are self-hosted, not loaded from a CDN. The only network fetches are the first-time download of the app and model weights, which are then cached.
- The header shows "Offline-ready · 0 bytes sent" once everything is cached.
- The code is open source: github.com/ianjhefer17/tabon.

### How big is the model? Does it run on phones?

**Standard: Qwen2.5-3B (about 1.7 GB). Lite: Qwen2.5-1.5B (about 0.9 GB).** Both are 4-bit quantized (MLC q4f16_1), downloaded once and stored in the browser.

- The AI needs WebGPU (Chrome 121+) and a GPU with enough memory. We've demoed it on a laptop (M1).
- Phones: rule-based detection and OCR run in any modern browser. The LLM depends on the phone having WebGPU and enough memory; we have not tested phones yet, so we won't claim it. Lite is the model we'd target there.
- Without WebGPU, Tabon still works with rules only and says so.

### Business model?

**Free for individuals, always. Redaction should not be a paid privacy feature.** Since inference runs on the user's device, our cost per document is ₱0, so free use doesn't burn money.

Options we'd explore (not validated yet):

- Paid team / business version for HR, property managers and lending companies that *receive* documents: bulk redaction, custom rules for their own forms, deployment on their own devices.
- Grants or partnerships with privacy, consumer-protection and OFW-support groups.

### Data Privacy Act (RA 10173)?

**Tabon is DPA-friendly by architecture, not a compliance certificate.**

- Under the Data Privacy Act of 2012, sharing personal information with a third-party processor is something you have to justify and secure. With Tabon there is no processor: the document never leaves the browser.
- It also supports data minimization: share only what the recipient needs (the "Sending to…" presets pre-select what a landlord, employer, seller or lender doesn't need to see).
- We don't give legal advice, and we don't claim Tabon makes anyone compliant.

---

### Quick backup lines

- **Why "Tabon"?** Filipino for "to cover up". You cover what's not theirs to see.
- **PDF?** Yes. Pages render locally with self-hosted pdf.js; export is image-only, so no hidden text layer survives.
- **Accuracy numbers?** We don't quote numbers we haven't measured. Show it live on the sample documents instead.
- **Sample documents?** All fictional and watermarked SAMPLE.
