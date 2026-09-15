import * as pdfjsLib from 'pdfjs-dist'
import type { DocKind } from './types'

// Match the worker to the exact installed version, served from a CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

/** Reads every page of a PDF and returns the concatenated text. */
export async function extractText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(line)
  }
  await doc.cleanup()
  return pages.join('\n')
}

const AMOUNT_RE = /(?:₱|php|p)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi

const CASH_KEYWORDS = [
  'cash requested',
  'amount requested',
  'requested amount',
  'cash advance',
  'amount',
  'grand total',
  'total',
]

const LIQ_KEYWORDS = [
  'amount liquidated',
  'total liquidated',
  'liquidated',
  'total expenses',
  'grand total',
  'total',
]

/**
 * Picks the most likely amount from the text. Candidates near an
 * accounting keyword outrank stray numbers; ties break toward the
 * largest value, which is almost always the document total.
 */
function parseAmount(text: string, kind: DocKind): { amount: number; confident: boolean } {
  const lower = text.toLowerCase()
  const keywords = kind === 'cash' ? CASH_KEYWORDS : LIQ_KEYWORDS

  let best = { amount: 0, score: -1, confident: false }

  for (const match of text.matchAll(AMOUNT_RE)) {
    const value = Number.parseFloat(match[1].replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) continue

    const index = match.index ?? 0
    const window = lower.slice(Math.max(0, index - 40), index + 8)

    let score = 0
    keywords.forEach((kw, i) => {
      if (window.includes(kw)) score = Math.max(score, keywords.length - i)
    })
    // Prefer values that were written with a peso sign / decimals.
    if (/₱|php/i.test(match[0])) score += 0.5
    if (match[1].includes('.')) score += 0.25

    if (score > best.score || (score === best.score && value > best.amount)) {
      best = { amount: value, score, confident: score > 0 }
    }
  }

  return { amount: best.amount, confident: best.confident }
}

const PROJECT_LABELS = [
  /project\s*(?:name|title)?\s*[:#-]\s*([^\n]+)/i,
  /(?:name of project|for the project)\s*[:#-]?\s*([^\n]+)/i,
  /(?:program|activity)\s*[:#-]\s*([^\n]+)/i,
]

/** Finds a project name from labelled text, falling back to the file name. */
function parseProject(text: string, fileName: string): string {
  for (const re of PROJECT_LABELS) {
    const m = text.match(re)
    if (m?.[1]) {
      const cleaned = m[1].trim().replace(/\s{2,}/g, ' ').slice(0, 80)
      if (cleaned.length > 2) return cleaned
    }
  }
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(cash request|liquidation|cr|liq)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Unassigned'
}

export interface ParsedResult {
  project: string
  amount: number
  needsReview: boolean
  rawText: string
}

export async function parsePdf(file: File, kind: DocKind): Promise<ParsedResult> {
  const rawText = await extractText(file)
  const { amount, confident } = parseAmount(rawText, kind)
  const project = parseProject(rawText, file.name)
  return { project, amount, needsReview: !confident || amount === 0, rawText }
}
