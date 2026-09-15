import { Fragment } from 'react'
import { formatPeso } from '@/lib/format'
import type { ExtractedDoc } from '@/lib/types'

export function ExpensesTable({ docs }: { docs: ExtractedDoc[] }) {
  const withExpenses = docs.filter((d) => d.expenses.length > 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Project</th>
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {withExpenses.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                No expense line items parsed yet.
              </td>
            </tr>
          ) : (
            withExpenses.map((doc) => {
              const fileTotal = doc.expenses.reduce((s, e) => s + e.amount, 0)
              return (
                <Fragment key={doc.id}>
                  <tr className="bg-muted/40">
                    <td colSpan={5} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {doc.fileName}
                    </td>
                  </tr>
                  {doc.expenses.map((e) => (
                    <tr key={e.id} className="border-b border-border">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-card-foreground">{e.date || '—'}</td>
                      <td className="px-3 py-2 text-card-foreground">{doc.project}</td>
                      <td className="px-3 py-2 text-card-foreground">{e.category}</td>
                      <td className="px-3 py-2 text-card-foreground">{e.description}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-card-foreground">
                        {formatPeso(e.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-border">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                      Total expenses
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-card-foreground">
                      {formatPeso(fileTotal)}
                    </td>
                  </tr>
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
