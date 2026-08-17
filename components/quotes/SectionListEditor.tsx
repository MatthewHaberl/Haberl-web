'use client'

// ─────────────────────────────────────────────────────────────────────────────
// SectionListEditor — an ordered list of scope section names, edited in place.
//
// Used twice over the same shape: on the new-quote form (this quote's sections)
// and in Settings → Work types (a type's starting sections). Rename in the row,
// reorder with the arrows, drop with the ✕, add by typing or by clicking one of
// the house names. Names are cleaned (cleanSectionNames) by the caller on save,
// not here — mid-edit a blank row must survive or you cannot type into it.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sectionSuggestions, type WorkType } from '@/lib/quotes/work-types'

export function SectionListEditor({
  sections,
  onChange,
  workTypes,
  addPlaceholder = 'Add a section (e.g. Distribution board)',
  emptyHint,
}: {
  sections: string[]
  onChange: (next: string[]) => void
  /** Live work types, for the suggestion chips. Omitted → the static seed. */
  workTypes?: WorkType[]
  addPlaceholder?: string
  emptyHint?: string
}) {
  const [draft, setDraft] = useState('')

  const rename = (i: number, name: string) =>
    onChange(sections.map((s, j) => (j === i ? name : s)))

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= sections.length) return
    const next = [...sections]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  const drop = (i: number) => onChange(sections.filter((_, j) => j !== i))

  const add = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    setDraft('')
    if (sections.some((s) => s.trim().toLowerCase() === name.toLowerCase())) return
    onChange([...sections, name])
  }

  const unused = sectionSuggestions(workTypes).filter(
    (s) => !sections.some((c) => c.trim().toLowerCase() === s.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-2">
      {sections.length === 0 && emptyHint && (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}

      {sections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sections.map((name, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
              <Input
                value={name}
                onChange={(e) => rename(i, e.target.value)}
                placeholder="Section name"
                className="h-9 flex-1"
              />
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                onClick={() => move(i, 1)} disabled={i === sections.length - 1} title="Move down">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                onClick={() => drop(i)} title="Remove section">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }}
          placeholder={addPlaceholder}
          className="h-9 max-w-xs"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => add(draft)} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      {unused.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Common:</span>
          {unused.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
