import { formatPeso } from '@/lib/format'
import type { ExtractedDoc } from '@/lib/types'

export function CategoryBreakdown({ docs }: { docs: ExtractedDoc[] }) {
  const withData = docs.filter((d) => d.categories.length > 0)

  if (withData.length === 0) {
    return <p className="text-sm text-muted-foreground">No liquidation data yet.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {withData.map((doc) => {
        const rows = [...doc.categories].sort((a, b) => b.subtotal - a.subtotal)
        const total = rows.reduce((s, r) => s + r.subtotal, 0)

        return (
          <div key={doc.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-semibold text-card-foreground">{doc.project}</p>
              <p className="shrink-0 truncate text-xs text-muted-foreground">{doc.fileName}</p>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-navy text-navy-foreground">
                    <th className="px-4 py-2.5 text-left font-semibold tracking-wide">CATEGORY</th>
                    <th className="px-4 py-2.5 text-right font-semibold tracking-wide">SUBTOTAL (₱)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.category} className="odd:bg-card even:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium text-card-foreground">{r.category}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-card-foreground">
                        {formatPeso(r.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/50">
                    <td className="px-4 py-2.5 text-left font-semibold text-card-foreground">Total</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-card-foreground">
                      {formatPeso(total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
