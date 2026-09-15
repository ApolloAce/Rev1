import { formatPercent, formatPeso } from '@/lib/format'
import type { ProjectRow } from '@/lib/types'

export function ProjectsTable({ rows }: { rows: ProjectRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No projects yet. Upload cash request or liquidation PDFs to populate this table.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted text-left text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Project</th>
            <th className="px-4 py-2.5 text-right font-medium">Cash Requested</th>
            <th className="px-4 py-2.5 text-right font-medium">Liquidated</th>
            <th className="px-4 py-2.5 text-right font-medium">Balance</th>
            <th className="px-4 py-2.5 text-right font-medium">Utilization</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.project} className="border-t border-border">
              <td className="px-4 py-2.5 font-medium text-card-foreground">{row.project}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(row.cashRequested)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(row.liquidated)}</td>
              <td
                className={`px-4 py-2.5 text-right tabular-nums ${
                  row.balance < 0 ? 'text-destructive' : 'text-card-foreground'
                }`}
              >
                {formatPeso(row.balance)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatPercent(row.utilization)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
