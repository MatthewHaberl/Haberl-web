'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Contingency (migration 129) — the allowance this quote carries for the work
// nobody can see yet.
//
// Engine-agnostic, like credits: a contingency is a property of the QUOTE, not
// of the design or the scope behind it, so this panel sits below both builders
// and behaves identically either way. Nothing here touches a line item — the
// allowance is added to the finished BOM at generate time.
//
// Two decisions live in this form and they are independent:
//   HOW MUCH   a percentage of materials (the usual), of labour, of the whole
//              quote, a flat amount — and/or rounding the total up.
//   WHO SEES IT  its own line on the customer's document, or folded into the
//              labour line the way the management fee already is. The money is
//              the same either way; what changes is whether the customer is
//              handed a row whose only possible answer is "take that off".
//
// The preview runs the SAME arithmetic the server will (computeContingencyFrom)
// against the bases stamped into the last generated document — so what it says
// here is what the document will say, without a browser loading a 15k-row
// catalog to work it out.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, TriangleAlert, Umbrella } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import { randZA } from '@/lib/quotes/credits'
import {
  CONTINGENCY_BASES, computeContingencyFrom, contingencyBasisSpec,
  DEFAULT_CONTINGENCY_LABEL, describeContingency, parseContingency,
  type ContingencyBases, type ContingencyBasis, type QuoteContingency,
} from '@/lib/quotes/contingency'

interface Props {
  requestId: string
  /** quote_requests.contingency — the saved jsonb. */
  raw: unknown
  status: string
  /**
   * quote_requests.generated_quote — read ONLY for `contingencyBases`, the
   * materials/labour/total figures BEFORE the allowance was added. The
   * document's own total is no use: it already has the contingency in it, so
   * pricing a change against it would compound.
   */
  generatedQuote: unknown
}

/** Common round-up steps. Anything else is typed into the box. */
const ROUND_STEPS = [0, 100, 500, 1000, 5000]

function basesFromDocument(generatedQuote: unknown): ContingencyBases | null {
  if (!generatedQuote) return null
  let data: unknown = generatedQuote
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { return null }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const raw = (data as Record<string, unknown>).contingencyBases
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  return {
    materialsR: n(r.materialsR),
    labourR: n(r.labourR),
    totalR: n(r.totalR),
    hasLabour: r.hasLabour === true,
  }
}

export function ContingencyPanel({ requestId, raw, status, generatedQuote }: Props) {
  const router = useRouter()
  const saved = useMemo(() => parseContingency(raw), [raw])
  const [draft, setDraft] = useState<QuoteContingency>(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Re-seed when the row is re-read from the server (a save, a regenerate).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to a new server prop, not deriving state from render.
    setDraft(saved)
  }, [saved])

  const set = (patch: Partial<QuoteContingency>) => setDraft((d) => ({ ...d, ...patch }))

  const bases = useMemo(() => basesFromDocument(generatedQuote), [generatedQuote])
  const preview = bases ? computeContingencyFrom(draft, bases) : null
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const issued = status === 'sent' || status === 'accepted' || status === 'declined'
  const spec = contingencyBasisSpec(draft.basis)
  const isPercent = draft.basis === 'materials' || draft.basis === 'labour' || draft.basis === 'total'

  // A folded contingency needs a labour line to fold into. Where the last
  // generate found none, say so here rather than letting it print as its own
  // line on a document that was told to hide it.
  const foldImpossible = draft.enabled && !draft.show && bases !== null && !bases.hasLabour

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    // Normalised on the way out so what is stored is what the server will read
    // back — the same clamps parseContingency applies at generate time.
    const value: QuoteContingency = {
      ...draft,
      label: draft.label.trim() || DEFAULT_CONTINGENCY_LABEL,
      note: draft.note?.trim() || null,
    }
    const { error: dbError } = await createClient()
      .from('quote_requests').update({ contingency: value }).eq('id', requestId)
    setSaving(false)
    if (dbError) {
      setError(dbError.message)
      return
    }
    setMessage(
      status === 'pending'
        ? 'Saved — it lands on the quote when you generate it.'
        : issued
          ? 'Saved — Reissue the quote above to put the new total in front of the customer.'
          : 'Saved — hit Regenerate above to re-price the quote with it.',
    )
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="p-4">
        <CollapsibleSection
          storageKey={`quote-contingency:${requestId}`}
          title="Contingency"
          icon={<Umbrella />}
          count={saved.enabled ? 1 : undefined}
          defaultOpen={saved.enabled}
        >
          <p className="text-xs text-muted-foreground mb-3 max-w-3xl">
            Money added to this quote for what you can&rsquo;t see yet &mdash; the perished conduit
            inside the wall, the DB that&rsquo;s fuller than the photo showed, the sheet that cracks
            when it&rsquo;s lifted. It goes on top of the priced work, never into the deposit, so
            it&rsquo;s only collected on completion &mdash; and if the job runs clean, it stays with
            the business instead of coming out of your margin.
          </p>

          <label className="flex items-start gap-2 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => set(
                // Seed the usual allowance when switching it on for the first time,
                // rather than opening on a form that is enabled and adds R0.00.
                e.target.checked && draft.percent === 0 && draft.amountR === 0
                  ? { enabled: true, percent: 5 }
                  : { enabled: e.target.checked },
              )}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary shrink-0"
            />
            <span>
              <span className="text-sm text-foreground">Add a contingency to this quote</span>
              <span className="block text-xs text-muted-foreground">{describeContingency(draft)}</span>
            </span>
          </label>

          {draft.enabled && (
            <div className="space-y-4">
              {/* ── How much ─────────────────────────────────────────────── */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cont-basis">Work it out as</Label>
                  <Select
                    id="cont-basis"
                    value={draft.basis}
                    onChange={(e) => set({ basis: e.target.value as ContingencyBasis })}
                  >
                    {CONTINGENCY_BASES.map((b) => (
                      <option key={b.key} value={b.key}>{b.label}</option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">{spec.hint}</p>
                </div>

                <div>
                  {isPercent ? (
                    <>
                      <Label htmlFor="cont-percent">Percentage</Label>
                      <Input
                        id="cont-percent"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        inputMode="decimal"
                        trailingText="%"
                        value={draft.percent || ''}
                        // No numeric placeholder. A greyed-out "5" sitting in an empty
                        // percentage box reads as a five that is being ignored, and the
                        // quote then rounds up and adds nothing while appearing to
                        // carry 5%. Empty must look empty.
                        placeholder=""
                        onChange={(e) => set({ percent: Number(e.target.value) || 0 })}
                      />
                      <p className={`mt-1 text-xs ${draft.percent > 0 ? 'text-muted-foreground' : 'text-warning'}`}>
                        {draft.percent > 0
                          ? '5–10% is the usual allowance on a job with unknowns behind a wall.'
                          : 'Empty — nothing is being added. Type a percentage; 5–10% is usual on a job with unknowns behind a wall.'}
                      </p>
                    </>
                  ) : draft.basis === 'fixed' ? (
                    <>
                      <Label htmlFor="cont-amount">Amount</Label>
                      <Input
                        id="cont-amount"
                        type="number"
                        min="0"
                        step="50"
                        inputMode="decimal"
                        leadingText="R"
                        value={draft.amountR || ''}
                        placeholder="0.00"
                        onChange={(e) => set({ amountR: Number(e.target.value) || 0 })}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Stays exactly this, whatever the quote is re-priced at.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground sm:pt-7">
                      No allowance of its own &mdash; only the rounding below.
                    </p>
                  )}
                </div>
              </div>

              {/* ── Round the total up ───────────────────────────────────── */}
              <div>
                <Label htmlFor="cont-round">Then round the total up to the next</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-40">
                    <Input
                      id="cont-round"
                      type="number"
                      min="0"
                      step="50"
                      inputMode="decimal"
                      leadingText="R"
                      value={draft.roundToR || ''}
                      placeholder="0"
                      onChange={(e) => set({ roundToR: Number(e.target.value) || 0 })}
                    />
                  </div>
                  {ROUND_STEPS.map((step) => (
                    <Button
                      key={step}
                      type="button"
                      size="sm"
                      variant={draft.roundToR === step ? 'accent' : 'outline'}
                      onClick={() => set({ roundToR: step })}
                    >
                      {step === 0 ? 'Off' : `R${step.toLocaleString('en-ZA')}`}
                    </Button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  R47&nbsp;312.40 with R500 rounding quotes at R47&nbsp;500.00 &mdash; the difference
                  joins the allowance. Off leaves the total exactly where the pricing lands.
                </p>
              </div>

              {/* ── What the customer sees ───────────────────────────────── */}
              <div className="rounded-lg border border-border p-3 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What the customer sees
                </h3>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.show}
                    onChange={(e) => set({ show: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary shrink-0"
                  />
                  <span>
                    <span className="text-sm text-foreground">Show it on the customer&rsquo;s quote</span>
                    <span className="block text-xs text-muted-foreground">
                      On: its own priced line, named below &mdash; what a commercial customer expects,
                      and what makes it defensible when you hand it back unspent. Off: folded into the
                      labour line, the same way the management fee is. The total is identical either
                      way; this is only about whether they get a row to argue with.
                    </span>
                  </span>
                </label>

                {draft.show && (
                  <div>
                    <Label htmlFor="cont-label">What it&rsquo;s called on the quote</Label>
                    <Input
                      id="cont-label"
                      value={draft.label}
                      placeholder={DEFAULT_CONTINGENCY_LABEL}
                      onChange={(e) => set({ label: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Say what it&rsquo;s for and it stops being a mystery charge &mdash;
                      &ldquo;Allowance for concealed wiring found on strip-out&rdquo; reads very
                      differently from &ldquo;Contingency&rdquo;.
                    </p>
                  </div>
                )}

                {foldImpossible && (
                  <p className="text-xs text-warning flex items-start gap-1.5">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    This quote has no labour line to fold it into, so it will print as its own line
                    anyway. Price some labour, or leave it shown and name it properly.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="cont-note">Internal note</Label>
                <Input
                  id="cont-note"
                  value={draft.note ?? ''}
                  placeholder="Why this job carries one — never printed"
                  onChange={(e) => set({ note: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          {/* What it does to the money — the same arithmetic the server runs at
              generate, against the figures the last generate priced. */}
          {preview && draft.enabled ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Quote total as priced</span>
                <span className="tabular-nums">{randZA(preview.beforeR)}</span>
              </div>
              {preview.uplift > 0 && (
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">
                    {draft.basis === 'fixed'
                      ? 'Allowance'
                      : `${draft.percent}% of ${randZA(preview.baseR)}`}
                  </span>
                  <span className="tabular-nums text-accent">+{randZA(preview.uplift)}</span>
                </div>
              )}
              {preview.uplift === 0 && draft.basis !== 'none' && (
                <div className="flex justify-between py-0.5">
                  <span className="text-warning">
                    {draft.basis === 'fixed' ? 'No amount set' : 'No percentage set'} — nothing added
                  </span>
                  <span className="tabular-nums text-warning">+{randZA(0)}</span>
                </div>
              )}
              {preview.rounding > 0 && (
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">
                    Rounded up to the next R{draft.roundToR.toLocaleString('en-ZA')}
                  </span>
                  <span className="tabular-nums text-accent">+{randZA(preview.rounding)}</span>
                </div>
              )}
              <div className="flex justify-between py-0.5 font-semibold border-t border-border mt-1 pt-1.5">
                <span>New quote total</span>
                <span className="tabular-nums">{randZA(preview.afterR)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Priced off the last generate. It lands on the document &mdash; and on the deposit
                split, which it never joins &mdash; when you regenerate.
              </p>
            </div>
          ) : draft.enabled ? (
            <p className="mt-4 text-xs text-muted-foreground">
              {status === 'pending'
                ? 'Generate the quote once and this will show you the exact figure — until then there are no priced materials to take a percentage of.'
                : 'This quote was last generated before contingencies existed, so there is nothing to price against yet. Regenerate it and the exact figure will show here.'}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Button onClick={save} disabled={saving || !dirty} type="button" variant="accent" size="sm">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save contingency
            </Button>
            <span className="text-xs text-muted-foreground">
              {status === 'pending'
                ? 'The quote hasn’t been generated yet — this is applied when you generate it.'
                : issued
                  ? 'This changes the price, so the customer only sees it after a Reissue.'
                  : 'Regenerate the quote after saving — the allowance is priced in at generate time.'}
            </span>
          </div>

          {message && <p className="mt-2 text-xs text-success">{message}</p>}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </CollapsibleSection>
      </CardContent>
    </Card>
  )
}
