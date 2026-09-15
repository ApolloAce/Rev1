export function formatPeso(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `\u20B1${safe.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe.toLocaleString('en-PH', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}
