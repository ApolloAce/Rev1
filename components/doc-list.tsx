'use client'

import { AlertTriangle, FileText, X } from 'lucide-react'
import type { ExtractedDoc } from '@/lib/types'

interface DocListProps {
  docs: ExtractedDoc[]
  onUpdate: (id: string, patch: Partial<Pick<ExtractedDoc, 'project' | 'amount'>>) => void
  onRemove: (id: string) => void
}

export function DocList({ docs, onUpdate, onRemove }: DocListProps) {
  if (docs.length === 0) return null

  return (
    <ul className="mt-3 flex flex-col gap-2">
      {docs.map((doc) => (
        <li
          key={doc.id}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center"
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <input
              aria-label={`Project for ${doc.fileName}`}
              value={doc.project}
              onChange={(e) => onUpdate(doc.id, { project: e.target.value })}
              className="w-full truncate rounded-sm bg-transparent text-sm font-medium text-card-foreground outline-none focus:bg-muted focus:px-1"
            />
            <p className="truncate text-xs text-muted-foreground" title={doc.fileName}>
              {doc.fileName}
            </p>
          </div>

          {doc.needsReview && (
            <span
              className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
              title="Amount could not be detected automatically — please confirm."
            >
              <AlertTriangle className="size-3" aria-hidden="true" />
              Review
            </span>
          )}

          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">{'\u20B1'}</span>
            <input
              aria-label={`Amount for ${doc.fileName}`}
              type="number"
              step="0.01"
              min="0"
              value={doc.amount || ''}
              onChange={(e) => onUpdate(doc.id, { amount: Number.parseFloat(e.target.value) || 0 })}
              className="w-28 rounded-md border border-border bg-background px-2 py-1 text-right text-sm text-foreground outline-none focus:border-ring"
            />
          </div>

          <button
            type="button"
            onClick={() => onRemove(doc.id)}
            aria-label={`Remove ${doc.fileName}`}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-destructive"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}
