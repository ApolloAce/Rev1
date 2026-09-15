'use client'

import { useRef, useState } from 'react'
import { Banknote, ClipboardList } from 'lucide-react'
import type { DocKind } from '@/lib/types'

interface UploadZoneProps {
  kind: DocKind
  title: string
  hint: string
  buttonLabel: string
  busy: boolean
  onFiles: (files: File[]) => void
}

const ACCENT = {
  cash: {
    ring: 'border-brand-blue/40 hover:border-brand-blue',
    active: 'border-brand-blue bg-brand-blue/5',
    button: 'bg-brand-blue text-brand-blue-foreground hover:opacity-90',
    Icon: Banknote,
    iconColor: 'text-brand-green',
  },
  liquidation: {
    ring: 'border-brand-green/45 hover:border-brand-green',
    active: 'border-brand-green bg-brand-green/5',
    button: 'bg-brand-green text-brand-green-foreground hover:opacity-90',
    Icon: ClipboardList,
    iconColor: 'text-brand-green',
  },
} as const

export function UploadZone({ kind, title, hint, buttonLabel, busy, onFiles }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const accent = ACCENT[kind]
  const { Icon } = accent

  function handleSelected(fileList: FileList | null) {
    if (!fileList) return
    const files = Array.from(fileList).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (files.length) onFiles(files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleSelected(e.dataTransfer.files)
      }}
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? accent.active : accent.ring
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <span className={`flex size-11 items-center justify-center rounded-lg bg-muted ${accent.iconColor}`}>
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={`mt-1 rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${accent.button}`}
        >
          {busy ? 'Reading PDFs…' : buttonLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleSelected(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
