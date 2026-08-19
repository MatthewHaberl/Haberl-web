'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Section presets in the scope builder — save one section, drop it into the
// next quote.
//
// Two controls over one shared pool (quote_section_presets, migration 125):
//   · SavePresetButton  — on a section header, captures that section's lines.
//   · PresetPicker      — beside "Add section", inserts a saved one whole.
//
// The pool is deliberately house-wide rather than per-user: the presets ARE the
// way the business quotes a board swap, and a second person quoting the same
// job should reach for the same section. Deleting is limited to whoever saved it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookmarkPlus, Check, LayoutList, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  parsePresetPayload, type ScopePresetPayload, type ScopeSectionPreset,
} from '@/lib/quotes/scope-presets'

/** The shared preset pool: read once on mount, re-read after every write. */
export function useSectionPresets() {
  const [presets, setPresets] = useState<ScopeSectionPreset[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    // By name, not newest-first: presets come in families ("2 IN 2 OUT PV
    // Combiner Noark 1000vdc 40A"), and alphabetical keeps a family together
    // and its sizes in order. Creation order interleaves them by accident.
    const { data } = await createClient()
      .from('quote_section_presets')
      .select('id,name,payload,created_by')
      .order('name', { ascending: true })
    setPresets(
      (data ?? []).flatMap((row) => {
        const r = row as { id: string; name: string; payload: unknown; created_by: string | null }
        const payload = parsePresetPayload(r.payload)
        if (!payload) return []
        return [{ id: r.id, name: r.name, payload, created_by: r.created_by }]
      }),
    )
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch: setPresets runs in reload's async continuation, not synchronously in the effect body.
  useEffect(() => { reload() }, [reload])

  const save = useCallback(async (name: string, payload: ScopePresetPayload) => {
    const { error } = await createClient()
      .from('quote_section_presets').insert({ name, payload })
    if (!error) await reload()
    return !error
  }, [reload])

  const remove = useCallback(async (id: string) => {
    const { error } = await createClient()
      .from('quote_section_presets').delete().eq('id', id)
    if (!error) await reload()
    return !error
  }, [reload])

  return { presets, loading, save, remove }
}

/** Close on an outside click or Escape — same behaviour as LineMovePicker. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

/**
 * "Save as preset" on a section header. Opens a name field pre-filled with the
 * section's own name — most presets want to be called what the section is called.
 */
export function SavePresetButton({ defaultName, lineCount, onSave }: {
  defaultName: string
  /** Shown in the panel, so it is obvious WHAT is being saved. */
  lineCount: number
  onSave: (name: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const close = useCallback(() => setOpen(false), [])
  const box = useDismiss(open, close)

  const start = () => {
    setName(defaultName)
    setState('idle')
    setOpen(true)
  }

  const commit = async () => {
    const clean = name.trim()
    if (!clean) return
    setState('saving')
    const ok = await onSave(clean)
    setState(ok ? 'saved' : 'error')
    if (ok) setTimeout(() => { setOpen(false); setState('idle') }, 900)
  }

  return (
    <div ref={box} className="relative">
      <Button
        type="button" variant="ghost" size="icon" className="h-7 w-7"
        title="Save this section as a preset — its name and every line under it"
        onClick={() => (open ? close() : start())}
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 max-w-[85vw] rounded-md border border-border bg-background p-3 text-left shadow-lg">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Save as preset
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {lineCount} line{lineCount === 1 ? '' : 's'} — reusable on any quote.
          </p>
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
            placeholder="Preset name"
            className="mt-2 h-8 text-xs"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px]">
              {state === 'saved' && <span className="text-emerald-600 dark:text-emerald-400">Saved</span>}
              {state === 'error' && <span className="text-destructive">Could not save</span>}
            </span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={close}>Cancel</Button>
              <Button type="button" size="sm" disabled={!name.trim() || state === 'saving'} onClick={commit}>
                {state === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {state === 'saved' && <Check className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** "From preset" beside Add section — inserts a saved section, lines and all. */
export function PresetPicker({ presets, loading, onPick, onDelete }: {
  presets: ScopeSectionPreset[]
  loading: boolean
  onPick: (preset: ScopeSectionPreset) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const close = useCallback(() => { setOpen(false); setQuery('') }, [])
  const box = useDismiss(open, close)

  // Every word must appear somewhere in the name, in any order — so "500 3 in"
  // finds the 3 IN 3 OUT 500vdc combiners the way you'd say it out loud.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = terms.length === 0
    ? presets
    : presets.filter((p) => {
        const name = p.name.toLowerCase()
        return terms.every((t) => name.includes(t))
      })

  // Only worth the extra control once the list outgrows a glance.
  const filterable = presets.length > 8

  return (
    <div ref={box} className="relative">
      <Button
        type="button" variant="outline" size="sm"
        onClick={() => (open ? close() : setOpen(true))}
        title="Insert a section you saved earlier"
      >
        <LayoutList className="h-3.5 w-3.5" /> From preset
      </Button>
      {open && (
        // Wide enough for the full name: the combiner presets differ only in
        // their last few characters ("… Noark 1000vdc 40A"), so a truncated
        // name tells you nothing about which one you are picking.
        <div className="absolute left-0 z-30 mt-1 w-[28rem] max-w-[92vw] rounded-md border border-border bg-background py-1 shadow-lg">
          <div className="flex items-baseline justify-between gap-2 px-3 py-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Saved sections
            </span>
            {filterable && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {shown.length} of {presets.length}
              </span>
            )}
          </div>
          {filterable && (
            <div className="px-3 pb-1.5">
              <Input
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Filter — try "500" or "3 in"'
                className="h-8 text-xs"
              />
            </div>
          )}
          {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>}
          {!loading && presets.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              None yet — save one from the bookmark button on any section.
            </p>
          )}
          {!loading && presets.length > 0 && shown.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nothing matches that filter.
            </p>
          )}
          <div className="max-h-[24rem] overflow-y-auto">
            {shown.map((p) => (
              <div key={p.id} className="flex items-center gap-1 pr-1 hover:bg-muted">
                <button
                  type="button"
                  className="min-w-0 flex-1 px-3 py-1.5 text-left"
                  onClick={() => { onPick(p); close() }}
                >
                  <span className="block truncate text-xs">{p.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {p.payload.lines.length} line{p.payload.lines.length === 1 ? '' : 's'}
                    {p.payload.section && p.payload.section !== p.name ? ` · ${p.payload.section}` : ''}
                  </span>
                </button>
                <Button
                  type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  title="Delete this preset"
                  onClick={() => onDelete(p.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
