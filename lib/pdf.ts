import * as pdfjsLib from 'pdfjs-dist'
import type { CategorySummary, DocKind, ExpenseLine } from './types'

// Match the worker to the exact installed version, served from a CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface ExtractedText {
  /** Whole document as one blob, useful for label lookups. */
  text: string
  /** Reconstructed visual lines, with wide column gaps preserved as double spaces. */
  lines: string[]
}

/**
 * Reads every page and reconstructs visual lines by grouping text items on the
 * same vertical position. Large horizontal gaps between items are preserved as
 * double spaces so table columns stay separable downstream.
 */
export async function extractText(file: File): Promise<ExtractedText> {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const lines: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()

    const rows = new Map<number, { x: number; w: number; str: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const tr = item.transform as number[]
      const y = Math.round(tr[5])
      const bucket = rows.get(y) ?? []
      bucket.push({ x: tr[4], w: (item as { width?: number }).width ?? 0, str: item.str })
      rows.set(y, bucket)
    }

    for (const y of Array.from(rows.keys()).sort((a, b) => b - a)) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x)
      let line = ''
      let prevEnd: number | null = null
      for (const p of parts) {
        if (prevEnd !== null) {
          const gap = p.x - prevEnd
          line += gap > 12 ? '  ' : gap > 0.5 ? ' ' : ''
        }
        line += p.str
        prevEnd = p.x + p.w
      }
      const cleaned = line.replace(/\s{3,}/g, '  ').trim()
      if (cleaned) lines.push(cleaned)
    }
  }

  await doc.cleanup()
  return { text: lines.join('\n'), lines }
}

const AMOUNT_RE = /(?:₱|php|p)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi

// A peso figure anywhere in a line. Used to grab the row's amount column.
const ANY_AMOUNT_RE = /(?:₱|php|p)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})/gi

// Tolerant of spaces around separators (PDFs often render "05 / 08 / 2026").
const DATE_RE =
  /^(\d{1,2}\s*[/-]\s*\d{1,2}(?:\s*[/-]\s*\d{2,4})?|\d{4}\s*[/-]\s*\d{1,2}\s*[/-]\s*\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}(?:,?\s*\d{2,4})?|\d{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*\d{2,4})?)$/i

const CATEGORY_HINTS = [
  'transportation',
  'transpo',
  'meals',
  'food',
  'snacks',
  'supplies',
  'materials',
  'honorarium',
  'communication',
  'rental',
  'venue',
  'accommodation',
  'lodging',
  'fuel',
  'gas',
  'representation',
  'printing',
  'equipment',
  'labor',
  'utilities',
  'allowance',
  'professional fee',
  'miscellaneous',
  'misc',
]

const CASH_KEYWORDS = [
  'cash requested',
  'amount requested',
  'requested amount',
  'cash advance',
  'amount',
  'grand total',
  'total',
]

/**
 * Picks the most likely single amount from the text. Candidates near an
 * accounting keyword outrank stray numbers; ties break toward the largest
 * value, which is almost always the document total.
 */
function parseAmount(text: string, keywords: string[]): { amount: number; confident: boolean } {
  const lower = text.toLowerCase()
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
    if (/₱|php/i.test(match[0])) score += 0.5
    if (match[1].includes('.')) score += 0.25

    if (score > best.score || (score === best.score && value > best.amount)) {
      best = { amount: value, score, confident: score > 0 }
    }
  }

  return { amount: best.amount, confident: best.confident }
}

/** Returns the last peso amount on a line and where it starts, or null. */
function lastAmount(line: string): { value: number; index: number; raw: string } | null {
  let found: { value: number; index: number; raw: string } | null = null
  for (const m of line.matchAll(ANY_AMOUNT_RE)) {
    const value = Number.parseFloat(m[1].replace(/,/g, ''))
    if (!Number.isFinite(value) || value <= 0) continue
    found = { value, index: m.index ?? 0, raw: m[0] }
  }
  return found
}

function isHeaderRow(lower: string): boolean {
  return /\bamount\b/.test(lower) && /(date|particular|description|nature|category|item|expense|qty)/.test(lower)
}

function isTotalRow(lower: string): boolean {
  return /\b(grand\s*total|sub[- ]?total|total)\b/.test(lower)
}

function isExplicitTotal(lower: string): boolean {
  return /(total\s*(expenses|expenditure|amount|liquidat)|grand\s*total|amount\s*liquidated)/.test(lower)
}

/**
 * Pulls expense rows from a liquidation PDF's expense table. It locates the
 * table by its header row, then reads every following row (splitting date /
 * category / description / amount) until it hits the totals. Each row keeps its
 * own fields so multiple files stay separated. Falls back to scanning any line
 * that ends in an amount when no header is present.
 */
function parseExpenses(lines: string[]): { expenses: ExpenseLine[]; explicitTotal: number | null } {
  const expenses: ExpenseLine[] = []
  let explicitTotal: number | null = null

  const headerIdx = lines.findIndex((l) => isHeaderRow(l.toLowerCase()))
  const start = headerIdx >= 0 ? headerIdx + 1 : 0

  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const lower = line.toLowerCase()

    const amt = lastAmount(line)

    // Totals: remember the explicit total, then stop reading table rows.
    if (isTotalRow(lower)) {
      if (amt) {
        if (isExplicitTotal(lower)) explicitTotal = amt.value
        else if (explicitTotal === null) explicitTotal = amt.value
      }
      // A grand total marks the end of the expense table.
      if (/grand\s*total|total\s*expenses|amount\s*liquidated/.test(lower)) break
      continue
    }

    if (!amt) continue
    // Ignore stray header rows that slipped through.
    if (isHeaderRow(lower)) continue

    const rest = line.slice(0, amt.index).trim().replace(/[-–—:]\s*$/, '').trim()
    if (!rest) continue

    // Wide column gaps were preserved as double spaces during extraction.
    const columns = rest
      .split(/\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean)

    // The first column is the date when it looks like one; drop it off the row.
    let date = ''
    if (columns.length > 1 && DATE_RE.test(columns[0])) {
      date = columns.shift()!.trim()
    }

    let category = 'Uncategorized'
    let description = ''
    if (columns.length >= 2) {
      // Remaining layout is Category | Description (+ any extra columns).
      category = columns[0]
      description = columns.slice(1).join(' — ')
    } else if (columns.length === 1) {
      const single = columns[0]
      const hint = CATEGORY_HINTS.find((h) => single.toLowerCase().includes(h))
      if (hint) category = capitalize(hint)
      description = single
    }
    if (!description) description = category !== 'Uncategorized' ? category : 'Expense'

    expenses.push({ id: makeId(), date, category, description, amount: amt.value })
  }

  return { expenses, explicitTotal }
}

/**
 * Reads the "Category Breakdown Summary" table that each liquidation PDF
 * contains — a two-column list of category name and its peso subtotal. Starts
 * at the section heading, skips the column header, then collects each
 * category/amount row until the table ends (grand total, blank gap, or a line
 * with no amount). Returns [] when the PDF has no such summary.
 */
function parseCategoryBreakdown(lines: string[]): CategorySummary[] {
  const startIdx = lines.findIndex((l) => /category\s*breakdown/i.test(l))
  if (startIdx < 0) return []

  const out: CategorySummary[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      if (out.length > 0) break
      continue
    }
    const lower = line.toLowerCase()

    // Column header row (e.g. "CATEGORY   SUBTOTAL (₱)") — skip it.
    if (/\bcategory\b/.test(lower) && /\bsubtotal\b/.test(lower)) continue

    const amt = lastAmount(line)
    if (!amt) {
      // No amount: end of table once we've started; otherwise keep scanning.
      if (out.length > 0) break
      continue
    }

    const isTotal = /\b(grand\s*total|total)\b/.test(lower)
    let name = line.slice(0, amt.index).trim().replace(/[-–—:]\s*$/, '').trim()
    name = name.replace(/\s*\(₱\).*/i, '').trim()

    if (isTotal) break
    if (!name) continue

    out.push({ category: name, subtotal: amt.value })
  }

  return out
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
  return (
    fileName
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b(cash request|liquidation|cr|liq)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim() || 'Unassigned'
  )
}

export interface ParsedResult {
  project: string
  amount: number
  needsReview: boolean
  rawText: string
  expenses: ExpenseLine[]
  categories: CategorySummary[]
}

/** Aggregates expense line items into category subtotals as a fallback. */
function categoriesFromExpenses(expenses: ExpenseLine[]): CategorySummary[] {
  const map = new Map<string, number>()
  for (const e of expenses) {
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
  }
  return Array.from(map.entries())
    .map(([category, subtotal]) => ({ category, subtotal }))
    .sort((a, b) => b.subtotal - a.subtotal)
}

export async function parsePdf(file: File, kind: DocKind): Promise<ParsedResult> {
  const { text, lines } = await extractText(file)
  const project = parseProject(text, file.name)

  if (kind === 'cash') {
    const { amount, confident } = parseAmount(text, CASH_KEYWORDS)
    return { project, amount, needsReview: !confident || amount === 0, rawText: text, expenses: [], categories: [] }
  }

  // Liquidation: the total liquidated is the report's total expenses. Prefer an
  // explicit "Total Expenses" figure; otherwise sum the extracted line items.
  const { expenses, explicitTotal } = parseExpenses(lines)
  const summed = expenses.reduce((s, e) => s + e.amount, 0)
  const amount = explicitTotal ?? summed

  // Prefer the PDF's own "Category Breakdown Summary" table; fall back to
  // aggregating the extracted line items by category.
  const summaryCats = parseCategoryBreakdown(lines)
  const categories = summaryCats.length > 0 ? summaryCats : categoriesFromExpenses(expenses)

  const confident = explicitTotal !== null || expenses.length > 0 || categories.length > 0

  return {
    project,
    amount,
    needsReview: !confident || amount === 0,
    rawText: text,
    expenses,
    categories,
  }
}
