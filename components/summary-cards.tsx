import { formatPercent, formatPeso } from '@/lib/format'

interface SummaryCardsProps {
  cashRequested: number
  liquidated: number
}

function Card({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'negative' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight ${
          tone === 'negative' ? 'text-destructive' : 'text-card-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function SummaryCards({ cashRequested, liquidated }: SummaryCardsProps) {
  const balance = cashRequested - liquidated
  const utilization = cashRequested > 0 ? (liquidated / cashRequested) * 100 : 0

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Summary">
      <Card label="Cash Requested" value={formatPeso(cashRequested)} />
      <Card label="Total Liquidated" value={formatPeso(liquidated)} />
      <Card label="Balance / Return" value={formatPeso(balance)} tone={balance < 0 ? 'negative' : 'default'} />
      <Card label="Utilization" value={formatPercent(utilization)} />
    </section>
  )
}
