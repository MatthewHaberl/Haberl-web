'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Check } from 'lucide-react'

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

// ── Searchable select (item 47) ───────────────────────────────────────────────
// A combobox that filters options as you type (not just jump-to-first-letter like a
// native <select>). Drop-in for the tiny native selects in sections / ProductPicker:
// styled to match (h-7, text-xs, border-border, bg-background). Keyboard-navigable
// (↑/↓/Enter/Escape), click-outside closes, shows the selected label when closed,
// filters case-insensitively on the visible label.
export function SearchableSelect({
  value, onChange, options, placeholder = 'Select…', noneLabel = 'None', className = '',
}: {
  value: string | null
  onChange: (v: string | null) => void
  options: Array<{ value: string; label: string; disabled?: boolean; hint?: string }>
  placeholder?: string
  noneLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [dropUp, setDropUp] = useState(false)
  const [listMax, setListMax] = useState(192)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // The "None" choice is always first; below it, options filtered by the typed query.
  const all = [{ value: '', label: noneLabel } as { value: string; label: string; disabled?: boolean; hint?: string }, ...options]
  const filtered = query.trim()
    ? all.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : all
  const selected = value == null ? null : options.find((o) => o.value === value) ?? null

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Reset the query/highlight each time the menu opens, then focus the filter input.
  // Also decide which way to open: inside the scrollable design canvas an absolute
  // dropdown can't push page height, so when there's little room below we flip it
  // upward and cap the list to the available space — otherwise lower options become
  // unreachable (you can't scroll to them).
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) {
      const below = window.innerHeight - rect.bottom - 8
      const above = rect.top - 8
      const up = below < 200 && above > below
      setDropUp(up)
      setListMax(Math.max(120, Math.min(256, (up ? above : below) - 48)))
    }
    inputRef.current?.focus()
  }, [open])

  function commit(v: string) {
    onChange(v === '' ? null : v)
    setOpen(false)
  }
  function move(delta: number) {
    if (!filtered.length) return
    // Skip disabled rows when arrowing.
    let i = active
    for (let n = 0; n < filtered.length; n++) {
      i = (i + delta + filtered.length) % filtered.length
      if (!filtered[i].disabled) break
    }
    setActive(i)
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      const opt = filtered[active]
      if (opt && !opt.disabled) commit(opt.value)
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="flex h-7 w-full items-center justify-between gap-1 rounded border border-border bg-background px-1.5 text-left text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <span className={`truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className={`absolute left-0 right-0 z-30 rounded-md border border-border bg-card shadow-md ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search…"
            className="h-7 w-full rounded-t-md border-b border-border bg-background px-1.5 text-xs focus:outline-none"
          />
          <ul className="overflow-auto py-0.5" style={{ maxHeight: listMax }}>
            {filtered.length === 0 ? (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">No matches</li>
            ) : (
              filtered.map((o, i) => {
                const isSel = (o.value === '' && value == null) || o.value === value
                return (
                  <li key={o.value || '__none__'}>
                    <button
                      type="button"
                      disabled={o.disabled}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => commit(o.value)}
                      className={`flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs disabled:opacity-40 disabled:cursor-not-allowed ${i === active ? 'bg-muted' : ''}`}
                    >
                      <span className="truncate">{o.label}{o.hint ? <span className="ml-1 text-[10px] text-muted-foreground">{o.hint}</span> : null}</span>
                      {isSel && <Check className="h-3 w-3 shrink-0 text-accent" />}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Collapsible card (item 46) ────────────────────────────────────────────────
// Accordion-style variant of SectionCard for combiner cards: the header toggles the
// body open/closed via a chevron. Matches SectionCard styling; `right` sits beside the
// chevron (e.g. a remove button) and doesn't toggle the card.
export function CollapsibleCard({
  title, subtitle, right, defaultOpen = true, children,
}: {
  title: ReactNode
  subtitle?: string
  right?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-start gap-2 text-left"
        >
          {open ? <ChevronUp className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </button>
        {right}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
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
