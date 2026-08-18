'use client'

// ─────────────────────────────────────────────────────────────────────────────
// "Move this line to another section" — the per-row control in the scope
// editor. Items land in the wrong section constantly (a cable typed into the
// PV section, a breaker picked while the DB section was the one being built),
// and the only fix until now was delete-and-retype, which loses the hand-set
// price, the markup and the supplier note with it.
//
// The move rewrites the line's (packageId, section) pair — nothing else — so a
// moved line keeps its id, its price and its overrides. On a quote with work
// packages the targets include the OTHER packages' sections, because "move
// them into a package" is exactly what the not-in-any-package card asks for.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { FolderInput } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface MoveTarget {
  /** Stable key — packageId + section. */
  id: string
  section: string
  packageId: string | null
  /** Package this section sits under; null on a single-package quote. */
  packageLabel: string | null
}

/**
 * Icon button + section list. Renders a disabled button when the quote has
 * only one section, so the row's column rhythm never changes under you.
 */
export function LineMovePicker({ targets, onMove }: {
  targets: MoveTarget[]
  onMove: (target: MoveTarget) => void
}) {
  const [open, setOpen] = useState(false)
  // Rows near the bottom of a long quote would open the list off-screen.
  const [dropUp, setDropUp] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (targets.length === 0) {
    return (
      <span
        className="flex h-8 w-7 items-center justify-center text-muted-foreground/40"
        title="Nowhere to move this to — add another section first"
      >
        <FolderInput className="h-3.5 w-3.5" />
      </span>
    )
  }

  // Grouped so two sections with the same name under different packages are
  // told apart by the heading above them.
  const groups: { label: string | null; items: MoveTarget[] }[] = []
  for (const t of targets) {
    const last = groups[groups.length - 1]
    if (last && last.label === t.packageLabel) last.items.push(t)
    else groups.push({ label: t.packageLabel, items: [t] })
  }

  return (
    <div ref={boxRef} className="relative">
      <Button
        type="button" variant="ghost" size="icon" className="h-8 w-7"
        title="Move this line to another section"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          setDropUp(box.bottom > window.innerHeight - 280)
          setOpen((v) => !v)
        }}
      >
        <FolderInput className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div
          className={`absolute right-0 z-30 w-64 max-w-[80vw] rounded-md border border-border bg-background py-1 shadow-lg ${
            dropUp ? 'bottom-full mb-1' : 'mt-1'}`}
        >
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Move to
          </div>
          <div className="max-h-64 overflow-y-auto">
            {groups.map((g, gi) => (
              <div key={g.label ?? `g${gi}`}>
                {g.label !== null && (
                  <div className="border-t border-border/60 px-3 pb-0.5 pt-1.5 text-[10px] font-medium text-muted-foreground">
                    {g.label}
                  </div>
                )}
                {g.items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => { onMove(t); setOpen(false) }}
                  >
                    {t.section}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
