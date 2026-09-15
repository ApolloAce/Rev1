export type DocKind = 'cash' | 'liquidation'

/** A single expense row pulled from a liquidation PDF's expense table. */
export interface ExpenseLine {
  id: string
  date: string
  category: string
  description: string
  amount: number
}

/** A category subtotal from a liquidation PDF's "Category Breakdown Summary" table. */
export interface CategorySummary {
  category: string
  subtotal: number
}

export interface ExtractedDoc {
  id: string
  kind: DocKind
  fileName: string
  project: string
  amount: number
  /** Full extracted text, kept for debugging / re-parsing. */
  rawText: string
  /** True when the amount could not be confidently detected. */
  needsReview: boolean
  /** Expense line items — only populated for liquidation documents. */
  expenses: ExpenseLine[]
  /** Category subtotals read from the liquidation PDF's breakdown summary. */
  categories: CategorySummary[]
}

export interface ProjectRow {
  project: string
  cashRequested: number
  liquidated: number
  balance: number
  utilization: number
}
