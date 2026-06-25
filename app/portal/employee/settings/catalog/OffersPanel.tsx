'use client'

// Per-product supplier offers: list every supplier's price for one catalog product,
// pick which supplier to buy from (preferred, default cheapest), add/remove offers.
// The DB (migration 052) keeps equipment_catalog.cost_rands in sync with the chosen
// offer, so onChange should reload the parent catalog list to reflect the new cost.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, Star, Trash2, ExternalLink } from 'lucide-react'

const VAT = 1.15

type Offer = {
  id: string
  supplier: string
  supplier_sku: string | null
  cost_rands: number
  list_price_rands: number | null
  source_url: string | null
  in_stock: boolean | null
}

function rands(n: number) {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function OffersPanel({
  catalogId,
  onChange,
}: {
  catalogId: string
  onChange?: () => void
}) {
  const supabase = createClient()
  const [offers, setOffers] = useState<Offer[]>([])
  const [preferred, setPreferred] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [adding, setAdding] = useState(false)
  const [fSupplier, setFSupplier] = useState('')
  const [fList, setFList] = useState('')
  const [fSku, setFSku] = useState('')
  const [fSource, setFSource] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error }, { data: row }] = await Promise.all([
      supabase
        .from('equipment_supplier_offers')
        .select('id,supplier,supplier_sku,cost_rands,list_price_rands,source_url,in_stock')
        .eq('catalog_id', catalogId)
        .order('cost_rands'),
      supabase
        .from('equipment_catalog')
        .select('preferred_supplier')
        .eq('id', catalogId)
        .maybeSingle(),
    ])
    if (error) setErr(error.message)
    setOffers((data ?? []) as Offer[])
    setPreferred((row?.preferred_supplier as string | null) ?? null)
    setLoading(false)
  }, [supabase, catalogId])

  useEffect(() => { load() }, [load])

  // Effective offer = preferred supplier's, else cheapest.
  const effective = (() => {
    if (!offers.length) return null
    if (preferred) {
      const match = offers.find((o) => o.supplier === preferred)
      if (match) return match
    }
    return offers.reduce((a, b) => (b.cost_rands < a.cost_rands ? b : a))
  })()

  async function addOffer() {
    const list = Number(fList)
    if (!fSupplier.trim() || !Number.isFinite(list) || list <= 0) {
      setErr('Supplier and a positive ex-VAT list price are required'); return
    }
    setBusy(true); setErr('')
    const cost = Math.round(list * VAT * 100) / 100
    const { error } = await supabase.from('equipment_supplier_offers').insert({
      catalog_id: catalogId,
      supplier: fSupplier.trim(),
      supplier_sku: fSku.trim() || null,
      list_price_rands: list,
      cost_rands: cost,
      source_url: fSource.trim() || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setAdding(false); setFSupplier(''); setFList(''); setFSku(''); setFSource('')
    await load(); onChange?.()
  }

  async function removeOffer(id: string) {
    setBusy(true); setErr('')
    const { error } = await supabase.from('equipment_supplier_offers').delete().eq('id', id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    await load(); onChange?.()
  }

  async function choosePreferred(supplier: string | null) {
    setBusy(true); setErr('')
    const { error } = await supabase
      .from('equipment_catalog').update({ preferred_supplier: supplier }).eq('id', catalogId)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setPreferred(supplier); onChange?.()
  }

  return (
    <div className="md:col-span-2 mt-2 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Suppliers &amp; pricing</p>
          <p className="text-xs text-muted-foreground">
            Cost follows the cheapest supplier unless you star a preferred one. Prices are ex-VAT list; cost = list × 1.15.
          </p>
        </div>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Add supplier
          </Button>
        )}
      </div>

      {err && <p className="mt-2 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{err}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading offers…
        </div>
      ) : offers.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No supplier offers yet — this product uses the single cost above. Add a supplier to compare prices.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="pb-2 pr-3">Use</th>
                <th className="pb-2 pr-3">Supplier</th>
                <th className="pb-2 pr-3">Their SKU</th>
                <th className="pb-2 pr-3">List (ex-VAT)</th>
                <th className="pb-2 pr-3">Cost</th>
                <th className="pb-2 pr-3"></th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => {
                const isEffective = effective?.id === o.id
                const isPreferred = preferred === o.supplier
                return (
                  <tr key={o.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => choosePreferred(isPreferred ? null : o.supplier)}
                        disabled={busy}
                        title={isPreferred ? 'Preferred supplier — click to revert to cheapest' : 'Make this the preferred supplier'}
                        className={isPreferred ? 'text-accent' : 'text-muted-foreground/40 hover:text-muted-foreground'}
                      >
                        <Star className="h-4 w-4" fill={isPreferred ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      {o.supplier}
                      {isEffective && (
                        <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">in use</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{o.supplier_sku ?? '—'}</td>
                    <td className="py-2 pr-3">{o.list_price_rands != null ? rands(o.list_price_rands) : '—'}</td>
                    <td className="py-2 pr-3 font-medium">{rands(o.cost_rands)}</td>
                    <td className="py-2 pr-3">
                      {o.source_url && (
                        <a href={o.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Supplier product page">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => removeOffer(o.id)}
                        disabled={busy}
                        title="Remove this supplier offer"
                        className="text-muted-foreground/50 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            {preferred
              ? <>Using <span className="font-medium text-foreground">{preferred}</span> (preferred).</>
              : <>Using the cheapest offer{effective ? <> — <span className="font-medium text-foreground">{effective.supplier}</span></> : null}.</>}
            {effective && <> Cost {rands(effective.cost_rands)}.</>}
          </p>
        </div>
      )}

      {adding && (
        <div className="mt-3 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Supplier</span>
            <Input value={fSupplier} onChange={(e) => setFSupplier(e.target.value)} placeholder="e.g. Herholdt's" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">List price (ex-VAT, R)</span>
            <Input value={fList} onChange={(e) => setFList(e.target.value)} placeholder="e.g. 573.00" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Their SKU (optional)</span>
            <Input value={fSku} onChange={(e) => setFSku(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Source URL (optional)</span>
            <Input value={fSource} onChange={(e) => setFSource(e.target.value)} placeholder="https://…" />
          </label>
          <div className="md:col-span-2 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setErr('') }} disabled={busy}>Cancel</Button>
            <Button variant="accent" size="sm" onClick={addOffer} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add offer'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
