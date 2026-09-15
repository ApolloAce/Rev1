'use client'

import { useEffect, useMemo, useState } from 'react'
import { CategoryBreakdown } from '@/components/category-breakdown'
import { DocList } from '@/components/doc-list'
import { ExpensesTable } from '@/components/expenses-table'
import { ProjectsTable } from '@/components/projects-table'
import { SummaryCards } from '@/components/summary-cards'
import { UploadZone } from '@/components/upload-zone'
import { formatPeso } from '@/lib/format'
import { parsePdf } from '@/lib/pdf'
import type { DocKind, ExtractedDoc, ProjectRow } from '@/lib/types'
import { db } from "@/lib/firebase"
import { collection, doc as firestoreDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from "firebase/firestore"

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function Page() {
  const [docs, setDocs] = useState<ExtractedDoc[]>([])
  const [busy, setBusy] = useState<DocKind | null>(null)
  const [status, setStatus] = useState('PDF reader loaded. Uploaded files will be read automatically.')
  const [loading, setLoading] = useState(true)

  // Subscribe to Firestore on mount — any device that opens this page
  // gets the current data plus live updates as others upload/edit/delete.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "documents"),
      (snapshot) => {
        const remoteDocs = snapshot.docs.map((d) => d.data() as ExtractedDoc)
        setDocs(remoteDocs)
        setLoading(false)
      },
      (err) => {
        console.log('[v0] Failed to load from Firestore:', err)
        setStatus('Could not load saved data. Check your connection.')
        setLoading(false)
      },
    )
    return () => unsubscribe()
  }, [])

  const cashDocs = docs.filter((d) => d.kind === 'cash')
  const liqDocs = docs.filter((d) => d.kind === 'liquidation')
  const cashTotal = cashDocs.reduce((sum, d) => sum + d.amount, 0)
  const liqTotal = liqDocs.reduce((sum, d) => sum + d.amount, 0)

  const projectRows = useMemo<ProjectRow[]>(() => {
    const map = new Map<string, ProjectRow>()
    for (const doc of docs) {
      const key = doc.project.trim() || 'Unassigned'
      const row = map.get(key) ?? { project: key, cashRequested: 0, liquidated: 0, balance: 0, utilization: 0 }
      if (doc.kind === 'cash') row.cashRequested += doc.amount
      else row.liquidated += doc.amount
      map.set(key, row)
    }
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        balance: row.cashRequested - row.liquidated,
        utilization: row.cashRequested > 0 ? (row.liquidated / row.cashRequested) * 100 : 0,
      }))
      .sort((a, b) => b.cashRequested - a.cashRequested)
  }, [docs])

  async function handleFiles(kind: DocKind, files: File[]) {
    setBusy(kind)
    setStatus(`Reading ${files.length} ${kind === 'cash' ? 'cash request' : 'liquidation'} PDF${files.length > 1 ? 's' : ''}…`)
    let addedCount = 0
    let reviewCount = 0

    for (const file of files) {
      let parsedDoc: ExtractedDoc
      try {
        const result = await parsePdf(file, kind)
        if (result.needsReview) reviewCount++
        parsedDoc = { id: makeId(), kind, fileName: file.name, ...result }
      } catch (err) {
        console.log('[v0] Failed to parse PDF:', file.name, err)
        parsedDoc = {
          id: makeId(),
          kind,
          fileName: file.name,
          project: file.name.replace(/\.pdf$/i, ''),
          amount: 0,
          rawText: '',
          needsReview: true,
          expenses: [],
          categories: [],
        }
        reviewCount++
      }

      try {
        await setDoc(firestoreDoc(collection(db, "documents"), parsedDoc.id), {
          ...parsedDoc,
          createdAt: serverTimestamp(),
        })
        addedCount++
        // No need to manually update local state — onSnapshot picks this up automatically
      } catch (err) {
        console.log('[v0] Failed to save to Firestore:', file.name, err)
      }
    }

    setBusy(null)
    setStatus(
      reviewCount > 0
        ? `Added ${addedCount} file(s). ${reviewCount} need a quick amount review.`
        : `Added ${addedCount} file(s). Amounts extracted successfully.`,
    )
  }

  async function updateDoc(id: string, patch: Partial<Pick<ExtractedDoc, 'project' | 'amount'>>) {
    const target = docs.find((d) => d.id === id)
    if (!target) return
    try {
      await setDoc(firestoreDoc(collection(db, "documents"), id), {
        ...target,
        ...patch,
        needsReview: false,
      })
    } catch (err) {
      console.log('[v0] Failed to update in Firestore:', id, err)
    }
  }

  async function removeDoc(id: string) {
    try {
      await deleteDoc(firestoreDoc(collection(db, "documents"), id))
    } catch (err) {
      console.log('[v0] Failed to delete from Firestore:', id, err)
    }
  }

  async function clearKind(kind: DocKind) {
    const toRemove = docs.filter((d) => d.kind === kind)
    try {
      await Promise.all(toRemove.map((d) => deleteDoc(firestoreDoc(collection(db, "documents"), d.id))))
      setStatus(`Cleared all ${kind === 'cash' ? 'cash requests' : 'liquidations'}.`)
    } catch (err) {
      console.log('[v0] Failed to clear from Firestore:', err)
    }
  }

  async function clearAll() {
    try {
      await Promise.all(docs.map((d) => deleteDoc(firestoreDoc(collection(db, "documents"), d.id))))
      setStatus('Cleared everything. Upload PDFs to start again.')
    } catch (err) {
      console.log('[v0] Failed to clear all from Firestore:', err)
    }
  }

  function downloadCsv() {
    const header = ['Type', 'Project', 'File', 'Amount']
    const lines = docs.map((d) =>
      [d.kind === 'cash' ? 'Cash Request' : 'Liquidation', d.project, d.fileName, d.amount.toFixed(2)]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rev1-cash-liquidation.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const actionBtn =
    'rounded-md border border-border bg-card px-3.5 py-2 text-sm font-medium text-card-foreground transition hover:bg-muted disabled:opacity-50'

  return (
    <main className="min-h-dvh">
      <header className="bg-navy text-navy-foreground">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-balance">REV1 Cash &amp; Liquidation System</h1>
          <p className="mt-1 text-sm text-navy-muted">Separate uploads · Repeated uploads · PDF extraction</p>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6">
        <SummaryCards cashRequested={cashTotal} liquidated={liqTotal} />

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-card-foreground">Upload Documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You can add files repeatedly; each new batch is appended to the existing list. PDFs are read automatically.
          </p>

          <div className="mt-5 flex flex-col gap-4">
            <div>
              <UploadZone
                kind="cash"
                title="Cash Requests"
                hint="Drop Cash Request PDFs here"
                buttonLabel="Choose Cash Request Files"
                busy={busy === 'cash'}
                onFiles={(files) => handleFiles('cash', files)}
              />
              <DocList docs={cashDocs} onUpdate={updateDoc} onRemove={removeDoc} />
            </div>

            <div>
              <UploadZone
                kind="liquidation"
                title="Liquidations"
                hint="Drop Liquidation PDFs here"
                buttonLabel="Choose Liquidation Files"
                busy={busy === 'liquidation'}
                onFiles={(files) => handleFiles('liquidation', files)}
              />
              <DocList docs={liqDocs} onUpdate={updateDoc} onRemove={removeDoc} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
              Cash Requests: {cashDocs.length}
            </span>
            <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
              Liquidations: {liqDocs.length}
            </span>
            <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
              Total Files: {docs.length}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={actionBtn} onClick={() => clearKind('cash')} disabled={cashDocs.length === 0}>
              Clear Cash Requests
            </button>
            <button
              type="button"
              className={actionBtn}
              onClick={() => clearKind('liquidation')}
              disabled={liqDocs.length === 0}
            >
              Clear Liquidations
            </button>
            <button type="button" className={actionBtn} onClick={clearAll} disabled={docs.length === 0}>
              Clear Everything
            </button>
            <button
              type="button"
              className="rounded-md bg-brand-blue px-3.5 py-2 text-sm font-medium text-brand-blue-foreground transition hover:opacity-90 disabled:opacity-50"
              onClick={downloadCsv}
              disabled={docs.length === 0}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="rounded-md bg-brand-blue px-3.5 py-2 text-sm font-medium text-brand-blue-foreground transition hover:opacity-90"
              onClick={() => window.print()}
            >
              Print / Save PDF
            </button>
          </div>

          <p className="mt-4 rounded-md border border-brand-green/30 bg-brand-green/10 px-4 py-3 text-sm text-card-foreground">
            {loading ? 'Loading saved data…' : status}
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold text-card-foreground">Projects</h2>
            {projectRows.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Net balance: {formatPeso(cashTotal - liqTotal)}
              </span>
            )}
          </div>
          <ProjectsTable rows={projectRows} />
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold text-card-foreground">Category Breakdown</h2>
            {liqDocs.length > 0 && (
              <span className="text-sm text-muted-foreground">Per liquidation file</span>
            )}
          </div>
          <CategoryBreakdown docs={liqDocs} />
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold text-card-foreground">Liquidation Expenses</h2>
            {liqTotal > 0 && (
              <span className="text-sm text-muted-foreground">Total: {formatPeso(liqTotal)}</span>
            )}
          </div>
          <ExpensesTable docs={liqDocs} />
        </section>
      </div>
    </main>
  )
}