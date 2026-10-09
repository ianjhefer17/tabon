// Captures docs/screenshot.png: the app with the fictional payslip sample scanned and boxed.
// Usage: npm run build && npm run preview, then: node scripts/screenshot.mjs [url]
// Drives the installed Chrome (channel 'chrome'), so no Playwright browser download is needed.
// AI model downloads are blocked so a fresh profile doesn't fetch ~1.7 GB; boxes come from the PH rules.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:4173/'
const out = 'docs/screenshot.png'

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
await page.route(/huggingface\.co|binary-mlc-llm-libs|\/models\//, (route) => route.abort())
await page.goto(url)
await page.getByRole('button', { name: 'Payslip' }).click()
await page.getByRole('button', { name: /Redact & Download/ }).waitFor({ timeout: 60_000 })
await page.waitForTimeout(1000)
mkdirSync('docs', { recursive: true })
await page.screenshot({ path: out })
await browser.close()
console.log(`Saved ${out}`)
