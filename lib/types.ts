export type DocKind = 'cash' | 'liquidation'

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
}

export interface ProjectRow {
  project: string
  cashRequested: number
  liquidated: number
  balance: number
  utilization: number
}
