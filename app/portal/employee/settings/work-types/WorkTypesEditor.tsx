'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Work types admin — the cards on step 1 of a new quote, editable as data.
//
// Two things stay locked once a type exists, because quotes already point at it:
//   · code   — quote_requests.work_type is an FK to it
//   · engine — a quote's payload is either a design (canvas) or a scope
//              (line items); flipping the engine would orphan every quote
//              already built with the other one
// Everything else — label, description, starting sections, pipeline, order,
// active — is free to change and only affects the NEXT quote. Nothing here is
// deleted either: an unused type is deactivated so its old quotes still resolve.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { SectionListEditor } from '@/components/quotes/SectionListEditor'
import {
  cleanSectionNames, workTypeCodeFrom, type WorkEngine, type WorkPipeline, type WorkType,
} from '@/lib/quotes/work-types'
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, X } from 'lucide-react'

interface FormState {
  code: string
  label: string
  description: string
  engine: WorkEngine
  job_pipeline: WorkPipeline
  sections: string[]
}

const EMPTY: FormState = {
  code: '', label: '', description: '', engine: 'scope', job_pipeline: 'lite', sections: [],
}

// 'solar' is the column default on quote_requests and the fallback every
// pre-W97 quote resolves through — hiding its card would leave the new-quote
// form with a selection that isn't on screen.
const UNDELETABLE = 'solar'

const ENGINE_LABEL: Record<WorkEngine, string> = {
  solar: 'Design canvas',
  scope: 'Line-item scope',
}

const PIPELINES: { id: WorkPipeline; label: string }[] = [
  { id: 'full', label: 'Full install — deposit, procurement, install, commissioning, COC, handover' },
  { id: 'lite', label: 'Short job — deposit, booked, work, COC, follow-up' },
]

export function WorkTypesEditor({ initial }: { initial: WorkType[] }) {
  const [types, setTypes] = useState<WorkType[]>(initial)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  // A code typed by hand stops tracking the label.
  const [codeTouched, setCodeTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  function startEdit(t: WorkType | null) {
    setError('')
    setCodeTouched(false)
    if (!t) {
      setEditing('new')
      setForm(EMPTY)
      return
    }
    setEditing(t.code)
    setForm({
      code: t.code,
      label: t.label,
      description: t.description ?? '',
      engine: t.engine,
      job_pipeline: t.job_pipeline === 'full' ? 'full' : 'lite',
      sections: [...t.default_sections],
    })
  }

  async function save() {
    const label = form.label.trim()
    if (label.length < 2) { setError('Give it a name'); return }

    // A solar-engine type is built on the canvas — it has no sections to seed.
    const sections = form.engine === 'scope' ? cleanSectionNames(form.sections) : []

    setBusy(true)
    setError('')

    if (editing === 'new') {
      const code = (codeTouched ? form.code : workTypeCodeFrom(label)).trim()
      if (!/^[a-z][a-z0-9_]*$/.test(code)) {
        setError('Code must be lowercase letters, numbers and underscores, starting with a letter')
        setBusy(false); return
      }
      if (types.some((t) => t.code === code)) {
        setError(`"${code}" already exists — pick a different name or code`)
        setBusy(false); return
      }
      const row = {
        code,
        label,
        engine: form.engine,
        job_pipeline: form.job_pipeline,
        default_sections: sections,
        description: form.description.trim() || null,
        sort_order: types.reduce((m, t) => Math.max(m, t.sort_order), -1) + 1,
        active: true,
      }
      const { data, error: dbErr } = await supabase
        .from('work_types').insert(row).select('*').single()
      if (dbErr) setError(dbErr.message)
      else if (data) {
        setTypes((prev) => [...prev, data as WorkType])
        setEditing(null)
      }
    } else if (editing) {
      const patch = {
        label,
        job_pipeline: form.job_pipeline,
        default_sections: sections,
        description: form.description.trim() || null,
      }
      const { error: dbErr } = await supabase
        .from('work_types').update(patch).eq('code', editing)
      if (dbErr) setError(dbErr.message)
      else {
        setTypes((prev) => prev.map((t) => (t.code === editing ? { ...t, ...patch } : t)))
        setEditing(null)
      }
    }
    setBusy(false)
  }

  /** Swap this type with its neighbour and persist both sort_orders. */
  async function move(code: string, dir: -1 | 1) {
    const ordered = [...types].sort((a, b) => a.sort_order - b.sort_order)
    const i = ordered.findIndex((t) => t.code === code)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ordered.length) return
    // Seeded rows can share a sort_order, and a straight swap of two equal
    // values is a no-op — renumber the whole list 0..n from what's on screen.
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
    const renumbered = ordered.map((t, k) => ({ ...t, sort_order: k }))
    const changed = renumbered.filter(
      (t) => types.find((o) => o.code === t.code)?.sort_order !== t.sort_order,
    )

    const before = types
    setTypes(renumbered)
    const results = await Promise.all(
      changed.map((t) =>
        supabase.from('work_types').update({ sort_order: t.sort_order }).eq('code', t.code)),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      setError(failed.error.message)
      setTypes(before) // don't show an order the database rejected
    }
  }

  async function toggleActive(t: WorkType) {
    if (t.code === UNDELETABLE && t.active) {
      setError('Solar PV is the default every existing quote resolves through — it can\'t be switched off.')
      return
    }
    setError('')
    const next = !t.active
    const { error: dbErr } = await supabase
      .from('work_types').update({ active: next }).eq('code', t.code)
    if (dbErr) setError(dbErr.message)
    else setTypes((prev) => prev.map((x) => (x.code === t.code ? { ...x, active: next } : x)))
  }

  const editForm = (
    <form
      onSubmit={(e) => { e.preventDefault(); save() }}
      className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Name (what the card says)" htmlFor="wt-label" required>
          <Input
            id="wt-label"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="e.g. Solar repair / service"
          />
        </FormField>
        {editing === 'new' ? (
          <FormField
            label="Code" htmlFor="wt-code"
            hint="Stored on every quote of this type — it can't be changed later."
          >
            <Input
              id="wt-code"
              value={codeTouched ? form.code : workTypeCodeFrom(form.label)}
              onChange={(e) => { setCodeTouched(true); setForm({ ...form, code: e.target.value }) }}
              placeholder="auto from the name"
            />
          </FormField>
        ) : (
          <FormField label="Code" htmlFor="wt-code" hint="Fixed — quotes point at it.">
            <Input id="wt-code" value={form.code} disabled />
          </FormField>
        )}
      </div>

      <FormField label="Description (the small print under the name)" htmlFor="wt-desc">
        <Textarea
          id="wt-desc"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="resize-none"
          placeholder="One line — what this type covers."
        />
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Quote engine"
          htmlFor="wt-engine"
          hint={editing === 'new'
            ? 'Design canvas = full solar layout. Line-item scope = sections of priced items.'
            : 'Fixed — existing quotes of this type are built with it.'}
        >
          <Select
            id="wt-engine"
            value={form.engine}
            disabled={editing !== 'new'}
            onChange={(e) => setForm({ ...form, engine: e.target.value as WorkEngine })}
          >
            <option value="scope">Line-item scope</option>
            <option value="solar">Design canvas</option>
          </Select>
        </FormField>
        <FormField label="Job pipeline (once the quote is accepted)" htmlFor="wt-pipeline">
          <Select
            id="wt-pipeline"
            value={form.job_pipeline}
            onChange={(e) => setForm({ ...form, job_pipeline: e.target.value as WorkPipeline })}
          >
            {PIPELINES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </FormField>
      </div>

      {form.engine === 'scope' ? (
        <FormField
          label="Starting sections"
          hint="Seeded onto a new quote of this type — the quote can still rename, reorder or drop them."
        >
          <SectionListEditor
            sections={form.sections}
            onChange={(sections) => setForm({ ...form, sections })}
            workTypes={types}
            emptyHint="None — a quote of this type starts blank and sections get added as it's built."
          />
        </FormField>
      ) : (
        <p className="text-xs text-muted-foreground">
          Design-canvas types have no sections — the equipment on the canvas builds the quote.
        </p>
      )}

      {error && <span className="text-xs text-destructive">{error}</span>}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="accent" size="sm" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(null); setError('') }}>
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
      </div>
    </form>
  )

  const ordered = [...types].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="flex flex-col gap-3">
      {error && editing === null && <p className="text-xs text-destructive">{error}</p>}

      {ordered.map((t, i) =>
        editing === t.code ? (
          <div key={t.code}>{editForm}</div>
        ) : (
          <Card key={t.code} className={t.active ? '' : 'opacity-60'}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 pt-4 pb-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{t.label}</p>
                  <Badge variant="outline">{ENGINE_LABEL[t.engine]}</Badge>
                  <Badge variant="outline">{t.job_pipeline === 'full' ? 'Full install' : 'Short job'}</Badge>
                  {!t.active && <Badge variant="default">Hidden</Badge>}
                </div>
                {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.engine === 'solar'
                    ? 'Built on the design canvas'
                    : t.default_sections.length
                      ? `Sections: ${t.default_sections.join(' · ')}`
                      : 'Starts blank — sections added as the quote is built'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => move(t.code, -1)} disabled={i === 0} title="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => move(t.code, 1)} disabled={i === ordered.length - 1} title="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => startEdit(t)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
                  onClick={() => toggleActive(t)}>
                  {t.active ? 'Hide' : 'Show'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ),
      )}

      {editing === 'new' ? (
        editForm
      ) : (
        <Button variant="outline" onClick={() => startEdit(null)} className="self-start">
          <Plus className="h-4 w-4" /> Add work type
        </Button>
      )}
    </div>
  )
}
