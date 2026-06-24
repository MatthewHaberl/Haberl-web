'use client'

// ── Canvas circuit colour theme ───────────────────────────────────────────────
// Single source of truth for the design-canvas / SLD circuit colours, keyed by
// electrical layer. Renderers (sld-nodes, edges, legends) should import from here
// rather than hard-coding hex values so the palette stays consistent.
//
// NOTE: these are DEFAULTS. They are the fallback for a Settings-backed override
// (per-company canvas colour preferences, stored in company_settings.canvas_colors).
// `resolveCanvasTheme` deep-merges any saved overrides over these; the
// CanvasThemeProvider / useCircuitTheme React layer feeds the resolved theme to the
// renderers. With no override (or no provider) every renderer reads these defaults,
// so behaviour is unchanged.

import { createContext, createElement, useContext, type ReactNode } from 'react'

export type CircuitLayer = 'pv' | 'battery' | 'ac' | 'earth' | 'data' | 'grid'

export interface CircuitStyle {
  label: string
  stroke: string
  fill: string
  // Striped layers (e.g. earth = green/yellow) ask the renderer to draw a second
  // colour as a stripe over `stroke`. Plain layers omit these.
  striped?: boolean
  stripe?: string
}

// Matthew's convention — PV orange, battery TEAL (not green), AC warm red,
// earth green/yellow striped, data dark blue, grid violet.
export const CIRCUIT_THEME: Record<CircuitLayer, CircuitStyle> = {
  pv:      { label: 'PV',      stroke: '#f97316', fill: '#f97316' },                                  // orange
  battery: { label: 'Battery', stroke: '#0d9488', fill: '#0d9488' },                                  // teal (was green — must NOT read as earth)
  ac:      { label: 'AC',      stroke: '#dc2626', fill: '#dc2626' },                                  // warm red (distinct from blue/green/orange)
  earth:   { label: 'Earth',   stroke: '#65a30d', fill: '#65a30d', striped: true, stripe: '#facc15' }, // green/yellow striped (renderer draws the stripe)
  data:    { label: 'Data',    stroke: '#1e3a5f', fill: '#1e3a5f' },                                  // dark blue (Matthew: Data = blue)
  grid:    { label: 'Grid',    stroke: '#7c3aed', fill: '#7c3aed' },                                  // violet
}

// ── Node → layer colour map ───────────────────────────────────────────────────
// Maps canvas node `type` keys to a circuit colour by reusing CIRCUIT_THEME, so
// sld-nodes can import one source instead of its own CLR map. Unmapped/auxiliary
// blocks (isolators, meters, custom) fall back to the caller's own neutral grey.
export const NODE_THEME: Record<string, string> = {
  solarArray: CIRCUIT_THEME.pv.stroke,
  combiner:   CIRCUIT_THEME.pv.stroke,   // DC combiner sits on the PV/DC side
  inverter:   CIRCUIT_THEME.data.stroke, // navy inverter body (#1e3a5f)
  battery:    CIRCUIT_THEME.battery.stroke,
  busblock:   CIRCUIT_THEME.battery.stroke,
  grid:       CIRCUIT_THEME.grid.stroke,
  dbBoard:    CIRCUIT_THEME.ac.stroke,
  earthing:   CIRCUIT_THEME.earth.stroke,
}

// Which layer each node `type` follows, so a resolved NODE_THEME tracks the layer
// overrides. Mirrors the static NODE_THEME map above by intent (inverter body reads
// the data/navy colour, combiner the PV colour, etc.).
const NODE_LAYER: Record<string, CircuitLayer> = {
  solarArray: 'pv',
  combiner:   'pv',
  inverter:   'data',
  battery:    'battery',
  busblock:   'battery',
  grid:       'grid',
  dbBoard:    'ac',
  earthing:   'earth',
}

// ── Settings-backed overrides ─────────────────────────────────────────────────
// A saved override only carries the fields a user actually changed, per layer, so a
// partial blob deep-merges cleanly over the defaults above. Stored as jsonb in
// company_settings.canvas_colors; missing/null degrades to the defaults.
export type CanvasColorOverrides = Partial<Record<CircuitLayer, Partial<CircuitStyle>>>

export interface ResolvedCanvasTheme {
  theme: Record<CircuitLayer, CircuitStyle>
  // Resolved node-type → colour lookup; follows the layer overrides via NODE_LAYER.
  nodeColor: Record<string, string>
}

// Deep-merge overrides over the default CIRCUIT_THEME and derive the matching
// NODE_THEME so node colours follow the layer overrides. Pure — no React.
export function resolveCanvasTheme(overrides?: CanvasColorOverrides | null): Record<CircuitLayer, CircuitStyle> {
  if (!overrides) return CIRCUIT_THEME
  const out = {} as Record<CircuitLayer, CircuitStyle>
  for (const key of Object.keys(CIRCUIT_THEME) as CircuitLayer[]) {
    const base = CIRCUIT_THEME[key]
    const patch = overrides[key]
    out[key] = patch ? { ...base, ...patch } : base
  }
  return out
}

// Derive the node-type → colour lookup from a (resolved) theme.
function resolveNodeTheme(theme: Record<CircuitLayer, CircuitStyle>): Record<string, string> {
  if (theme === CIRCUIT_THEME) return NODE_THEME
  const out: Record<string, string> = {}
  for (const [type, layer] of Object.entries(NODE_LAYER)) out[type] = theme[layer].stroke
  return out
}

// ── React layer ───────────────────────────────────────────────────────────────
// The provider takes the raw saved overrides and exposes the RESOLVED theme. With no
// provider, useCircuitTheme() returns the defaults — so renderers never break.
const DEFAULT_RESOLVED: ResolvedCanvasTheme = { theme: CIRCUIT_THEME, nodeColor: NODE_THEME }

const CanvasThemeContext = createContext<ResolvedCanvasTheme>(DEFAULT_RESOLVED)

export function CanvasThemeProvider({ value, children }: { value?: CanvasColorOverrides | null; children: ReactNode }) {
  const theme = resolveCanvasTheme(value)
  const resolved: ResolvedCanvasTheme = theme === CIRCUIT_THEME
    ? DEFAULT_RESOLVED
    : { theme, nodeColor: resolveNodeTheme(theme) }
  return createElement(CanvasThemeContext.Provider, { value: resolved }, children)
}

// Returns the RESOLVED circuit theme + node-colour lookup. Defaults outside a provider.
export function useCircuitTheme(): ResolvedCanvasTheme {
  return useContext(CanvasThemeContext)
}
