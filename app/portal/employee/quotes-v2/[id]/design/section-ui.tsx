'use client'

import type { ReactNode } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

export function SectionCard({
  title, subtitle, action, children,
}: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function NumberField({
  label, value, onChange, suffix, placeholder, min = 0, step = 'any', className = '',
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  suffix?: string
  placeholder?: string
  min?: number
  step?: number | 'any'
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={min}
          step={step}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        />
        {suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
    </label>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
      {children}
    </p>
  )
}

// ── Reorder control ───────────────────────────────────────────────────────────
// Tiny up/down chevrons for moving a list row (disabled at the ends). Sections
// own the list and pass an onMove(from, to) that swaps/splices the two indices.
export function ReorderButtons({
  index, count, onMove,
}: { index: number; count: number; onMove: (from: number, to: number) => void }) {
  return (
    <div className="flex flex-col -my-0.5">
      <button
        type="button"
        disabled={index <= 0}
        onClick={() => onMove(index, index - 1)}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        title="Move up"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={index >= count - 1}
        onClick={() => onMove(index, index + 1)}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        title="Move down"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Locked-field helpers (preset locks custom fields — see AcCombinerSection) ──
// Sections pass disabled={locked} on the input/select themselves and append this
// className so a preset-driven field reads as locked.
export const LOCKED_FIELD = 'disabled:opacity-60 disabled:cursor-not-allowed'

// Caption shown under a group of locked fields to explain why they can't be edited.
export function LockNote({ children }: { children?: ReactNode }) {
  return (
    <p className="text-[10px] text-muted-foreground">
      {children ?? 'Set by the selected product'}
    </p>
  )
}
