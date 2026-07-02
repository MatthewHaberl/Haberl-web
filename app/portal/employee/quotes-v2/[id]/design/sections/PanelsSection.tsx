'use client'

import { useState } from 'react'
import { Plus, Trash2, Sun, Zap } from 'lucide-react'
import { PSH_GAUTENG, SYSTEM_EFFICIENCY, parseInverterSizingSpec } from '@/lib/solar/quote-calculator'
import { stringVoltageProfile, computeStringLayout, hotCellTempC, type StringVoltageProfile } from '@/lib/solar/compliance'
import { panelGroupKwp, DIRECTIONS, ROOF_TYPES, DEFAULT_SITE_CONDITIONS, type SiteConditions, type PanelGroup } from '@/lib/solar/system-design'
import { useDesign } from '../DesignProvider'
import { useCatalog, byCategory } from '../useCatalog'
import { SectionCard, EmptyHint, LockNote, LOCKED_FIELD, SearchableSelect } from '../section-ui'

export function PanelsSection() {
  const { design, dispatch } = useDesign()
  const { items, loading } = useCatalog()
  const panels = byCategory(items, 'panel')

  // Selected inverter's voltage window (max DC input + MPPT range) — the string
  // voltages are checked against it. Same source the compliance engine uses.
  const inverterCatalogId = design.inverters[0]?.catalogId
  const inverterItem = inverterCatalogId ? items.find((i) => i.id === inverterCatalogId) : undefined
  const inverterSpec = parseInverterSizingSpec(inverterItem?.notes)

  // Site climate + edge-of-cloud margin driving the temperature-corrected voltages.
  const conditions = design.site ?? DEFAULT_SITE_CONDITIONS
  // Disclosure default (captured once): only open when the site diverges from the
  // Gauteng defaults — re-renders don't fight the user's manual toggling.
  const [siteOpen] = useState(() =>
    conditions.minAmbientC !== DEFAULT_SITE_CONDITIONS.minAmbientC ||
    conditions.maxAmbientC !== DEFAULT_SITE_CONDITIONS.maxAmbientC ||
    conditions.edgeOfCloudPct !== DEFAULT_SITE_CONDITIONS.edgeOfCloudPct)

  function addGroup() {
    const first = panels[0]
    dispatch({
      type: 'addPanelGroup',
      group: first
        ? { panelModel: first.description, panelWatts: first.watts_dc ?? 0, catalogId: first.id, panelCount: 0 }
        : undefined,
    })
  }

  // W82: "lay rows of N" — split an over-long group into strings of ≤ per, carrying
  // the panel + orientation across each new string (like adding rows of 16 on a map).
  function splitIntoStrings(g: PanelGroup, per: number) {
    if (per <= 0 || g.panelCount <= per) return
    const chunks: number[] = []
    for (let left = g.panelCount; left > 0; left -= per) chunks.push(Math.min(per, left))
    dispatch({ type: 'removePanelGroup', id: g.id })
    for (const count of chunks) {
      dispatch({
        type: 'addPanelGroup',
        group: {
          label: g.label, panelModel: g.panelModel, panelWatts: g.panelWatts,
          catalogId: g.catalogId, azimuth: g.azimuth, pitch: g.pitch,
          roofType: g.roofType, panelCount: count,
        },
      })
    }
  }

  return (
    <SectionCard
      title="Panels"
      subtitle="Add panel groups — each becomes a string on the diagram and feeds the live generation figure."
      action={
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add group
        </button>
      }
    >
      {design.panels.length === 0 ? (
        <EmptyHint>No panels yet. Add a group to start sizing the array.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          <details className="rounded-md border border-dashed border-border bg-muted/20" open={siteOpen}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-2 text-xs">
              <span className="font-medium text-foreground">Site conditions (advanced)</span>
              <span className="text-muted-foreground">
                {conditions.minAmbientC}°C to {conditions.maxAmbientC}°C · edge-of-cloud {conditions.edgeOfCloudPct}%
              </span>
            </summary>
            <div className="px-2.5 pb-2.5">
              <ConditionsBar
                conditions={conditions}
                hotCellC={Math.round(hotCellTempC(conditions.maxAmbientC))}
                onChange={(patch) => dispatch({ type: 'setSite', patch })}
              />
            </div>
          </details>
          {design.panels.map((g, idx) => {
            const kwp = panelGroupKwp(g)
            const dailyKwh = kwp * PSH_GAUTENG * SYSTEM_EFFICIENCY
            // Catalog panel selected → its watts come from the product (item 24).
            const locked = !!g.catalogId

            // Temperature-corrected string voltages (OpenSolar-style): every panel in
            // the group is one series string. The profile gives the cold-morning Voc
            // (max), the hot-cell Vmp (min) and pass/fail vs the inverter window.
            const selectedPanel = g.catalogId ? panels.find((p) => p.id === g.catalogId) : undefined
            const series = g.panelCount || 0
            const profile = selectedPanel
              ? stringVoltageProfile({ seriesPanels: series, panel: selectedPanel, spec: inverterSpec, conditions })
              : null
            // Max panels/string at this inverter + site → drives the "split into rows" prompt.
            const layout = selectedPanel && series > 0
              ? computeStringLayout({ panelCount: series, panel: selectedPanel, spec: inverterSpec, conditions })
              : null
            const maxPerString = layout?.maxSeriesAllowed ?? null
            return (
              <div key={g.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sun className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
                    {design.panels.length > 1 ? `String ${idx + 1}` : 'Solar array'}
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'removePanelGroup', id: g.id })}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove group"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Panel</span>
                    <SearchableSelect
                      value={g.catalogId}
                      noneLabel="Custom / unspecified"
                      placeholder={loading ? 'Loading…' : 'Custom / unspecified'}
                      options={panels.map((p) => ({ value: p.id, label: p.description }))}
                      onChange={(v) => {
                        const item = v == null ? undefined : panels.find((p) => p.id === v)
                        dispatch({
                          type: 'updatePanelGroup',
                          id: g.id,
                          patch: item
                            ? { catalogId: item.id, panelModel: item.description, panelWatts: item.watts_dc ?? g.panelWatts }
                            : { catalogId: null },
                        })
                      }}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Watts/panel</span>
                    <input
                      type="number" min={0} step={5}
                      value={g.panelWatts || ''}
                      disabled={locked}
                      onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { panelWatts: Number(ev.target.value) || 0 } })}
                      className={`h-9 rounded-md border border-border bg-background px-2 text-sm ${LOCKED_FIELD}`}
                    />
                    {locked && <LockNote>Watts come from the catalog panel</LockNote>}
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Count</span>
                    <input
                      type="number" min={0} step={1}
                      value={g.panelCount || ''}
                      onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { panelCount: Math.max(0, Math.round(Number(ev.target.value) || 0)) } })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    />
                  </label>

                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">Direction</span>
                    <select
                      value={g.azimuth ?? ''}
                      onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { azimuth: ev.target.value === '' ? null : Number(ev.target.value) } })}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    >
                      <option value="">— not set —</option>
                      {DIRECTIONS.map((d) => (
                        <option key={d.label} value={d.azimuth}>{d.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {maxPerString != null && series > maxPerString && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 text-xs">
                    <span className="text-amber-800 dark:text-amber-300">
                      {series} panels &gt; max {maxPerString}/string — split into {Math.ceil(series / maxPerString)} strings of ≤{maxPerString}.
                    </span>
                    <button
                      type="button"
                      onClick={() => splitIntoStrings(g, maxPerString)}
                      className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90"
                    >
                      Auto-split
                    </button>
                  </div>
                )}

                {profile && <StringVoltageTable profile={profile} />}
                {!profile && g.catalogId && series > 0 && (
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    String voltages — add a datasheet Voc to this panel in the catalog to enable the check.
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><strong className="text-foreground">{kwp.toFixed(2)}</strong> kWp</span>
                  <span>≈ <strong className="text-foreground">{dailyKwh.toFixed(1)}</strong> kWh/day</span>
                  <details className="ml-auto">
                    <summary className="cursor-pointer hover:text-foreground">More (optional)</summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Tilt°</span>
                        <input
                          type="number" placeholder="e.g. 15"
                          value={g.pitch ?? ''}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { pitch: ev.target.value === '' ? null : Number(ev.target.value) } })}
                          className="h-8 w-28 rounded border border-border bg-background px-1.5 text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Roof type</span>
                        <select
                          value={g.roofType}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { roofType: ev.target.value } })}
                          className="h-8 w-44 rounded border border-border bg-background px-1.5 text-xs"
                        >
                          <option value="">— not set —</option>
                          {ROOF_TYPES.map((rt) => (
                            <option key={rt} value={rt}>{rt}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Distance from combiner (m)</span>
                        <input
                          type="number" min={0} step={0.5} placeholder="e.g. 12"
                          value={g.distanceFromCombinerM ?? ''}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { distanceFromCombinerM: ev.target.value === '' ? undefined : Math.max(0, Number(ev.target.value) || 0) } })}
                          className="h-8 w-28 rounded border border-border bg-background px-1.5 text-xs"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[11px]">Jumpers (MC4 pairs)</span>
                        <input
                          type="number" min={0} step={1} placeholder="0"
                          value={g.jumpers ?? ''}
                          onChange={(ev) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { jumpers: ev.target.value === '' ? undefined : Math.max(0, Math.round(Number(ev.target.value) || 0)) } })}
                          className="h-8 w-28 rounded border border-border bg-background px-1.5 text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">For a string spanning two rows/roofs — adds MC4s.</span>
                      </label>
                    </div>
                  </details>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// Editable site climate + edge-of-cloud margin that drive the string-voltage checks.
function ConditionsBar({ conditions, hotCellC, onChange }: {
  conditions: SiteConditions
  hotCellC: number
  onChange: (patch: Partial<SiteConditions>) => void
}) {
  const field = (label: string, value: number, set: (v: number) => void, suffix: string, min?: number) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number" step={1} min={min}
          value={Number.isFinite(value) ? value : ''}
          onChange={(ev) => set(Number(ev.target.value))}
          className="h-8 w-16 rounded border border-border bg-background px-1.5 text-xs"
        />
        <span className="text-[11px] text-muted-foreground">{suffix}</span>
      </span>
    </label>
  )
  return (
    <div className="flex flex-wrap items-end gap-3 text-xs">
      {field('Min temp', conditions.minAmbientC, (v) => onChange({ minAmbientC: v }), '°C')}
      {field('Max temp', conditions.maxAmbientC, (v) => onChange({ maxAmbientC: v }), '°C')}
      {field('Edge-of-cloud', conditions.edgeOfCloudPct, (v) => onChange({ edgeOfCloudPct: Math.max(0, v) }), '%', 0)}
      <span className="self-center text-[11px] text-muted-foreground">
        Hot cell ≈ {hotCellC}°C · cold morning sets max Voc, hot cell sets min Vmp.
      </span>
    </div>
  )
}

// OpenSolar-style per-string voltage table: Voc/Vmp at the cold and hot corners,
// with pass/fail ticks against the inverter's DC-input and MPPT window.
function StringVoltageTable({ profile }: { profile: StringVoltageProfile }) {
  const { conditions } = profile
  const tick = (ok: boolean) =>
    ok ? <span className="text-emerald-600 dark:text-emerald-400">✓</span>
       : <span className="font-semibold text-destructive">✗</span>
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/30 p-2.5 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground">
        <Zap className="h-3 w-3" /> String voltages ({profile.seriesPanels} in series)
      </div>
      <table className="w-full tabular-nums">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left font-normal" />
            <th className="text-right font-normal">{conditions.minAmbientC}°C cold</th>
            <th className="text-right font-normal">{profile.hotCellC}°C cell</th>
            <th className="text-right font-normal">Limit</th>
          </tr>
        </thead>
        <tbody className="text-foreground">
          <tr>
            <td className="text-muted-foreground">Voc</td>
            <td className="text-right">{profile.vocCold} V</td>
            <td className="text-right">{profile.vocHot} V</td>
            <td className="text-right text-muted-foreground">{profile.maxDcVoltage != null ? `≤ ${profile.maxDcVoltage} V` : '—'}</td>
          </tr>
          <tr className={profile.overMaxDc ? 'text-destructive' : ''}>
            <td className="text-muted-foreground">+{conditions.edgeOfCloudPct}% edge-of-cloud</td>
            <td className="text-right font-semibold">
              {profile.vocColdEdge} V {profile.maxDcVoltage != null && tick(!profile.overMaxDc)}
            </td>
            <td />
            <td className="text-right text-muted-foreground">{profile.maxDcVoltage != null ? `≤ ${profile.maxDcVoltage} V` : '—'}</td>
          </tr>
          <tr>
            <td className="text-muted-foreground">Vmp</td>
            <td className={`text-right ${profile.overMpptMax ? 'font-semibold text-destructive' : ''}`}>
              {profile.vmpCold != null ? `${profile.vmpCold} V` : '—'}
            </td>
            <td className={`text-right ${profile.underMpptMin ? 'font-semibold text-destructive' : ''}`}>
              {profile.vmpHot != null ? `${profile.vmpHot} V` : '—'}{' '}
              {profile.mpptMinVoltage != null && profile.vmpHot != null && tick(!profile.underMpptMin)}
            </td>
            <td className="text-right text-muted-foreground">
              {profile.mpptMinVoltage != null ? `${profile.mpptMinVoltage}–${profile.mpptMaxVoltage ?? '?'} V` : '—'}
            </td>
          </tr>
        </tbody>
      </table>
      {(profile.overMaxDc || profile.underMpptMin || profile.overMpptMax) && (
        <p className="mt-1.5 text-destructive">
          {profile.overMaxDc && `Cold Voc exceeds the inverter's ${profile.maxDcVoltage}V max DC input — shorten the string. `}
          {profile.underMpptMin && `Hot Vmp is below the ${profile.mpptMinVoltage}V MPPT minimum — add panels in series. `}
          {profile.overMpptMax && `Cold Vmp exceeds the ${profile.mpptMaxVoltage}V MPPT maximum. `}
        </p>
      )}
      {profile.maxDcVoltage == null && (
        <p className="mt-1.5 text-muted-foreground">Select an inverter with a max-DC-voltage spec to check these against its window.</p>
      )}
    </div>
  )
}
