'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Wand2, Plus, Trash2, Printer, LayoutGrid, CornerUpLeft, AlertTriangle, Minus, Cable, MousePointer2, ZoomIn, ZoomOut, MoveHorizontal, MoveVertical, BoxSelect } from 'lucide-react'
import {
  DB_COMPONENT_KINDS, dbComponentKind, defaultDbComponent, dbModuleWidth,
  expandDbUnits, isDbExpanded, autoArrangeDb, mkId,
  dbPoles, dbDefaultEarth, dbPoleConductor, dbConductorColor, dbConductorLabel,
  DB_PHASE_SETS, DB_EARTH_POLE, defaultDbSection,
  type AcCombiner, type DcCombiner, type DbComponent, type DbComponentKind,
  type DbWire, type DbConductor, type DbTerminalRef, type PhaseColorSet, type DbSection,
} from '@/lib/solar/system-design'
import { useDesign } from './DesignProvider'
import { useCatalog } from './useCatalog'
import { ProductPicker } from './ProductPicker'

// One DIN module = MODULE_PX wide; a rail is ROW_H tall. These are defaults — width
// and channel height are adjustable at runtime (see moduleW / channelH state).
const MODULE_W_DEF = 34
const ROW_H = 64
const RAIL_GAP_DEF = 20   // vertical channel between rails (room for stacked conductors)
const TERM_R = 4.5    // terminal dot radius
const TERM_INSET = 9  // how far the terminal sits inside the block's top / bottom edge

const KIND_ABBR: Record<string, string> = {
  mainSwitch: 'MAIN', breaker: 'MCB', rcbo: 'RCBO', rccb: 'E/L', spd: 'SPD',
  changeover: 'C/O', isolator: 'ISO', contactor: 'CONT', timer: 'TMR',
  meter: 'kWh', indicator: 'LAMP', busbar: 'BAR', custom: '—',
}

// Colour a device block by what it does, so the board reads at a glance. Hex kept
// inline (not Tailwind classes) so the tint/border always resolve regardless of theme.
function kindColor(kind: DbComponentKind): string {
  switch (kind) {
    case 'mainSwitch': case 'isolator': case 'changeover': return '#dc2626' // red — supply / switching
    case 'breaker': case 'rcbo': return '#2563eb'                            // blue — protection
    case 'rccb': return '#d97706'                                           // amber — earth leakage
    case 'spd': return '#7c3aed'                                            // purple — surge
    case 'indicator': return '#16a34a'                                      // green — indication
    case 'meter': case 'timer': case 'contactor': return '#0891b2'          // cyan — control / metering
    default: return '#64748b'                                               // slate — busbar / custom
  }
}

// ── Orthogonal wire routing helpers ─────────────────────────────────────────
type Pt = { x: number; y: number }
type Rect = { x0: number; x1: number; y0: number; y1: number }

// Split an axis-aligned segment into sub-segments that are "behind" a device body
// (hidden = dashed/transparent) vs in open space (solid). Lets every conductor be
// traced even where it runs behind a breaker.
function clipSeg(p: Pt, q: Pt, rects: Rect[]): Array<{ a: Pt; b: Pt; hidden: boolean }> {
  const horiz = Math.abs(p.y - q.y) < 0.001
  const lo = horiz ? Math.min(p.x, q.x) : Math.min(p.y, q.y)
  const hi = horiz ? Math.max(p.x, q.x) : Math.max(p.y, q.y)
  if (hi - lo < 0.01) return []
  const fixed = horiz ? p.y : p.x
  const iv: Array<[number, number]> = []
  for (const r of rects) {
    if (horiz) {
      if (fixed >= r.y0 && fixed <= r.y1) { const a = Math.max(lo, r.x0), b = Math.min(hi, r.x1); if (a < b) iv.push([a, b]) }
    } else {
      if (fixed >= r.x0 && fixed <= r.x1) { const a = Math.max(lo, r.y0), b = Math.min(hi, r.y1); if (a < b) iv.push([a, b]) }
    }
  }
  iv.sort((m, n) => m[0] - n[0])
  const merged: Array<[number, number]> = []
  for (const s of iv) { const last = merged[merged.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else merged.push([s[0], s[1]]) }
  const pt = (t: number): Pt => (horiz ? { x: t, y: fixed } : { x: fixed, y: t })
  const out: Array<{ a: Pt; b: Pt; hidden: boolean }> = []
  let cur = lo
  for (const [a, b] of merged) {
    if (cur < a - 0.01) out.push({ a: pt(cur), b: pt(a), hidden: false })
    out.push({ a: pt(a), b: pt(b), hidden: true })
    cur = b
  }
  if (cur < hi - 0.01) out.push({ a: pt(cur), b: pt(hi), hidden: false })
  return out
}

// A contrast "casing" behind each conductor so it stays visible whatever the board
// colour: a light outline behind dark wires (e.g. black neutral), a dark one behind
// light wires (white / yellow).
function casingColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum < 0.5 ? '#e2e8f0' : '#334155'
}

// Path continuation commands for a horizontal run that "hops" (half-circle bridge)
// over each crossing x — the industry convention for wires that cross but do NOT
// connect (a dot = joined). Returns L/A commands only (no leading M) so it can be
// appended to a continuous conductor path for clean single-line corners.
function hopCmds(fromX: number, toX: number, y: number, crosses: number[], r: number): string {
  const dir = toX >= fromX ? 1 : -1
  const cs = crosses.filter((x) => (x - fromX) * dir > r && (toX - x) * dir > r).sort((a, b) => dir * (a - b))
  let d = ''
  for (const cx of cs) {
    const sweep = dir > 0 ? 0 : 1                 // keep the bump pointing upward either direction
    d += ` L ${cx - dir * r} ${y} A ${r} ${r} 0 0 ${sweep} ${cx + dir * r} ${y}`
  }
  d += ` L ${toX} ${y}`
  return d
}

type AddTarget = { row: number; startWay: number }
type DragState = { id: string; width: number; kind: DbComponentKind; label: string; color: string; x: number; y: number; ox: number }
type Preview = { row: number; index: number } // row === -1 → hovering the tray (drop = unplace)

export function DbFaceplate({ combinerId, boardKind = 'ac', onClose }: { combinerId: string; boardKind?: 'ac' | 'dc'; onClose: () => void }) {
  const { design, dispatch } = useDesign()
  const { items } = useCatalog()
  // The faceplate drives the AC board or a DC combiner — both hold DbComponent[] +
  // wires/sections/rowHeights, so the layout/wiring engine below is shared.
  const board: AcCombiner | DcCombiner | null = boardKind === 'dc'
    ? (design.dcCombiners.find((c) => c.id === combinerId) ?? null)
    : (design.acCombiners.find((c) => c.id === combinerId) ?? null)
  const phases = design.inverters[0]?.phases ?? 1

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addAt, setAddAt] = useState<AddTarget | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // Pointer-drag state: the dragged block follows the cursor while the breakers on
  // the hovered rail slide aside to open a gap (see startDrag / commitDrag below).
  const [drag, setDrag] = useState<DragState | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const railRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const trayRef = useRef<HTMLDivElement | null>(null)
  const movedRef = useRef(false)
  // Wiring layer: mode toggle + a live cable being drawn from a terminal.
  const [mode, setMode] = useState<'layout' | 'wiring'>('layout')
  const [wireDraft, setWireDraft] = useState<{ from: DbTerminalRef; conductor: DbConductor; x: number; y: number } | null>(null)
  const [hoverWire, setHoverWire] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // View controls: overall zoom, module width (horizontal spacing) and channel
  // height (vertical routing room between rails).
  const [zoom, setZoom] = useState(1)
  const [moduleW, setModuleW] = useState(MODULE_W_DEF)
  const [channelH, setChannelH] = useState(RAIL_GAP_DEF)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)

  // Close on Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Normalise to one-unit-per-breaker the moment the board is opened for layout, so
  // "MCB ×6" becomes six individually placeable breakers (never grouped).
  const expandedOnce = useRef(false)
  useEffect(() => {
    if (expandedOnce.current || !board) return
    expandedOnce.current = true
    const comps0 = board.components ?? []
    if (!isDbExpanded(comps0)) {
      const patch = { components: expandDbUnits(comps0) }
      if (boardKind === 'dc') dispatch({ type: 'updateCombiner', id: board.id, patch })
      else dispatch({ type: 'updateAcCombiner', id: board.id, patch })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flash = (msg: string) => { setNote(msg); window.setTimeout(() => setNote((n) => (n === msg ? null : n)), 2200) }

  if (!board) return null

  // Runtime-adjustable spacing (shadow the defaults so all geometry below uses them).
  const MODULE_PX = moduleW
  const RAIL_GAP = channelH

  const ways = Math.max(1, Math.round(board.ways || 12))
  const rows = Math.max(1, Math.round(board.rows || 1))
  const comps = board.components ?? []
  const placed = comps.filter((c) => c.slot)
  const unplaced = comps.filter((c) => !c.slot)
  const railWidth = ways * MODULE_PX

  // Occupancy per rail (only in-bounds slots count toward capacity / overlap).
  const inBounds = (c: DbComponent) => c.slot && c.slot.row >= 0 && c.slot.row < rows && c.slot.startWay >= 0 && c.slot.startWay + c.slot.width <= ways
  const onBoard = placed.filter(inBounds)
  const offBoard = placed.filter((c) => !inBounds(c))
  const usedModules = onBoard.reduce((s, c) => s + (c.slot?.width ?? 1), 0)
  const capacity = ways * rows
  const free = Math.max(0, capacity - usedModules)

  const wires = board.wires ?? []
  const phaseSet: PhaseColorSet = board.phaseColors ?? 'rwy'
  const compPoles = (c: DbComponent) => Math.max(1, Math.round(c.poles ?? dbPoles(c.kind, phases)))
  const compEarth = (c: DbComponent) => c.earth ?? dbDefaultEarth(c.kind)

  // ── Persistence helpers (writes route to the AC board or the DC combiner) ────
  const setBoard = (patch: Partial<AcCombiner> & Partial<DcCombiner>) => {
    if (boardKind === 'dc') dispatch({ type: 'updateCombiner', id: board.id, patch })
    else dispatch({ type: 'updateAcCombiner', id: board.id, patch })
  }
  const setComponents = (next: DbComponent[]) => setBoard({ components: next })
  const setWires = (next: DbWire[]) => setBoard({ wires: next })
  // Drop any wires that reference terminals that no longer exist (device gone /
  // unplaced / poles reduced), so the diagram never points at nothing.
  const validWires = (list: DbWire[], nextComps: DbComponent[]) => {
    const ok = (r: DbTerminalRef) => {
      const c = nextComps.find((x) => x.id === r.componentId)
      if (!c || !c.slot) return false
      if (r.pole === DB_EARTH_POLE) return compEarth(c)
      return r.pole < compPoles(c)
    }
    return list.filter((w) => ok(w.from) && ok(w.to))
  }
  const patchComponent = (id: string, p: Partial<DbComponent>) => {
    const next = comps.map((c) => (c.id === id ? { ...c, ...p } : c))
    setBoard({ components: next, wires: validWires(wires, next) })
  }
  const removeComponent = (id: string) => {
    const next = comps.filter((c) => c.id !== id).map((c) => ({ ...c, fedFrom: c.fedFrom.map((f) => (f === id ? '' : f)) }))
    setBoard({ components: next, wires: validWires(wires, next) })
  }

  // Is [start, start+width) free on `row`, ignoring `exceptId`?
  function fits(row: number, start: number, width: number, exceptId?: string): boolean {
    if (start < 0 || start + width > ways) return false
    for (const c of onBoard) {
      if (c.id === exceptId || c.slot!.row !== row) continue
      const a = c.slot!.startWay, b = a + c.slot!.width
      if (start < b && a < start + width) return false
    }
    return true
  }

  // First free gap of `width` on `row` at/after `preferred`, else scanning from 0.
  function firstGap(row: number, width: number, preferred: number, exceptId?: string): number | null {
    for (let s = Math.max(0, preferred); s + width <= ways; s++) if (fits(row, s, width, exceptId)) return s
    for (let s = 0; s + width <= ways; s++) if (fits(row, s, width, exceptId)) return s
    return null
  }

  // First free single space anywhere on the board (scans rails top-to-bottom) — the
  // landing spot for the "Add" button; falls back to rail 1 (device then goes to tray).
  const firstFreeSlot = (): AddTarget => {
    for (let r = 0; r < rows; r++) { const s = firstGap(r, 1, 0); if (s !== null) return { row: r, startWay: s } }
    return { row: 0, startWay: 0 }
  }

  // Per-rail height — drag the handle at a rail's bottom edge to make it taller/shorter.
  const setRowHeight = (r: number, h: number) => {
    const rh = Array.from({ length: rows }, (_, i) => Math.round(board.rowHeights?.[i] ?? ROW_H))
    rh[r] = Math.max(48, Math.min(260, Math.round(h)))
    setBoard({ rowHeights: rh })
  }
  const startRowResize = (e: React.PointerEvent, r: number) => {
    if (e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    const rect = railRefs.current[r]?.getBoundingClientRect()
    const top = rect ? rect.top : e.clientY
    const onMove = (ev: PointerEvent) => setRowHeight(r, (ev.clientY - top) / zoom)
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ── Pointer-based drag (slide-to-move with push-to-insert) ───────────────────
  // The breakers already on a rail, left-to-right (excluding the one being dragged).
  const railUnitsOf = (row: number, exceptId?: string) =>
    onBoard.filter((c) => c.slot!.row === row && c.id !== exceptId).sort((a, b) => a.slot!.startWay - b.slot!.startWay)

  // Where in the sequence the cursor wants to insert, using packed widths so wide
  // devices count for more than one space.
  const insertionIndex = (row: number, relX: number, exceptId: string) => {
    const units = railUnitsOf(row, exceptId)
    const cm = relX / MODULE_PX
    let pos = 0
    for (let i = 0; i < units.length; i++) {
      const w = units[i].slot!.width
      if (cm < pos + w / 2) return i
      pos += w
    }
    return units.length
  }

  // Which rail (or the tray) is under the cursor, and the insertion index there.
  const hitTest = (cx: number, cy: number, exceptId: string): Preview | null => {
    const tr = trayRef.current?.getBoundingClientRect()
    if (tr && cx >= tr.left && cx <= tr.right && cy >= tr.top && cy <= tr.bottom) return { row: -1, index: 0 }
    for (let r = 0; r < rows; r++) {
      const rect = railRefs.current[r]?.getBoundingClientRect()
      if (!rect) continue
      if (cy >= rect.top - 12 && cy <= rect.bottom + 12) {
        const relX = Math.max(0, Math.min(railWidth, (cx - rect.left) / zoom))
        return { row: r, index: insertionIndex(r, relX, exceptId) }
      }
    }
    return null
  }

  // While dragging, where a given block renders — the hovered rail reflows to open a
  // gap of the dragged width at the insertion point; every other block stays put.
  const renderStart = (c: DbComponent): number => {
    if (!drag || !preview || preview.row !== c.slot!.row) return c.slot!.startWay
    const units = railUnitsOf(c.slot!.row, drag.id)
    let pos = 0
    for (let i = 0; i < units.length; i++) {
      if (i === preview.index) pos += drag.width
      if (units[i].id === c.id) return pos
      pos += units[i].slot!.width
    }
    return c.slot!.startWay
  }

  const startDrag = (e: React.PointerEvent, c: DbComponent) => {
    if (e.button !== 0) return
    const width = Math.min(ways, Math.max(1, c.slot?.width ?? c.poles ?? dbModuleWidth(c.kind, phases)))
    const rect = e.currentTarget.getBoundingClientRect()
    const ox = e.clientX - rect.left
    const startX = e.clientX, startY = e.clientY
    movedRef.current = false
    let live: Preview | null = c.slot ? { row: c.slot.row, index: -1 } : null
    setDrag({ id: c.id, width, kind: c.kind, label: c.label, color: kindColor(c.kind), x: e.clientX, y: e.clientY, ox })
    // eslint-disable-next-line react-hooks/immutability -- pointerdown handler, never render: suppressing text selection for the drag has to happen here and is undone in onUp.
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      if (!movedRef.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return
      movedRef.current = true
      live = hitTest(ev.clientX, ev.clientY, c.id)
      setPreview(live)
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      if (movedRef.current) commitDrag(c.id, width, live)
      else setSelectedId(c.id) // a tap (no real movement) just selects
      setDrag(null)
      setPreview(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const commitDrag = (id: string, width: number, p: Preview | null) => {
    const c = comps.find((x) => x.id === id)
    if (!c || !p) return               // dropped nowhere → snap back, no change
    if (p.row === -1) { patchComponent(id, { slot: undefined }); return } // tray → unplace
    const targetRow = Math.max(0, Math.min(rows - 1, p.row))
    const order = railUnitsOf(targetRow, id)
    const idx = Math.max(0, Math.min(order.length, p.index))
    const ids: string[] = order.map((u) => u.id)
    ids.splice(idx, 0, id)
    // Repack the rail left-to-right in the new order so nothing overlaps.
    let pos = 0
    const startOf: Record<string, number> = {}
    for (const uid of ids) { startOf[uid] = pos; pos += uid === id ? width : (order.find((u) => u.id === uid)!.slot!.width) }
    setComponents(comps.map((x) => {
      if (x.id === id) return { ...x, slot: { row: targetRow, startWay: startOf[id], width } }
      if (x.id in startOf) return { ...x, slot: { ...x.slot!, row: targetRow, startWay: startOf[x.id] } }
      return x
    }))
    setSelectedId(id)
    if (pos > ways) flash('Rail is full — the last device spilled off; add ways or a rail.')
  }

  // ── Wiring geometry + cable drawing (wrapper coordinate space) ───────────────
  const rowH = (r: number) => Math.max(40, Math.round(board.rowHeights?.[r] ?? ROW_H))
  const railTop = (row: number) => { let y = 0; for (let i = 0; i < row; i++) y += rowH(i) + RAIL_GAP; return y }
  const termPos = (c: DbComponent, end: 'top' | 'bottom', pole: number) => {
    const x0 = c.slot!.startWay * MODULE_PX
    const wpx = c.slot!.width * MODULE_PX
    const yTop = railTop(c.slot!.row) + TERM_INSET
    const yBot = railTop(c.slot!.row) + rowH(c.slot!.row) - TERM_INSET
    if (pole === DB_EARTH_POLE) return { x: x0 + wpx - 5, y: yBot }
    const n = compPoles(c)
    return { x: x0 + (wpx * (pole + 1)) / (n + 1), y: end === 'top' ? yTop : yBot }
  }
  const sameTerm = (a: DbTerminalRef, b: DbTerminalRef) => a.componentId === b.componentId && a.end === b.end && a.pole === b.pole
  // Every terminal on placed devices (for rendering + drop hit-testing).
  const terminals = (): Array<{ ref: DbTerminalRef; x: number; y: number; conductor: DbConductor }> => {
    const out: Array<{ ref: DbTerminalRef; x: number; y: number; conductor: DbConductor }> = []
    for (const c of onBoard) {
      const n = compPoles(c)
      for (let p = 0; p < n; p++) {
        const cond = dbPoleConductor(p, n)
        out.push({ ref: { componentId: c.id, end: 'top', pole: p }, ...termPos(c, 'top', p), conductor: cond })
        out.push({ ref: { componentId: c.id, end: 'bottom', pole: p }, ...termPos(c, 'bottom', p), conductor: cond })
      }
      if (compEarth(c)) out.push({ ref: { componentId: c.id, end: 'bottom', pole: DB_EARTH_POLE }, ...termPos(c, 'bottom', DB_EARTH_POLE), conductor: 'E' })
    }
    return out
  }
  const refPos = (r: DbTerminalRef) => { const c = comps.find((x) => x.id === r.componentId); return c && c.slot ? termPos(c, r.end, r.pole) : null }
  const rowOf = (r: DbTerminalRef) => comps.find((c) => c.id === r.componentId)?.slot?.row ?? 0
  // Horizontal routing lanes sit in the gutter just above / below each rail.
  const topLaneY = (row: number) => railTop(row) - 7
  const botLaneY = (row: number) => railTop(row) + rowH(row) + 7
  // Conductors sit on a shared baseline plane by default; each wire can be raised /
  // lowered on its own by dragging (stored as `lane`). No forced auto-stepping.
  const baseLaneOf = (w: DbWire) => (w.from.end === 'top' ? topLaneY(rowOf(w.from)) : botLaneY(rowOf(w.from)))
  const laneYOf = (w: DbWire) => baseLaneOf(w) + (w.lane ?? 0)
  // Orthogonal route: out of A into its (offset) gutter lane, across, down/up into B.
  const wirePts = (w: DbWire): Pt[] | null => {
    const a = refPos(w.from), b = refPos(w.to)
    if (!a || !b) return null
    const ly = laneYOf(w)
    return [a, { x: a.x, y: ly }, { x: b.x, y: ly }, b]
  }
  // Device bodies (for hiding conductors that pass behind a breaker).
  const deviceRects: Rect[] = onBoard.map((c) => ({
    x0: c.slot!.startWay * MODULE_PX, x1: (c.slot!.startWay + c.slot!.width) * MODULE_PX,
    y0: railTop(c.slot!.row) + 4, y1: railTop(c.slot!.row) + rowH(c.slot!.row) - 4,
  }))
  // Every vertical stub (drop) — used to detect where another wire's horizontal
  // must hop over it.
  const verticals: Array<{ id: string; x: number; y0: number; y1: number }> = []
  for (const w of wires) {
    const p = wirePts(w)
    if (!p) continue
    verticals.push({ id: w.id, x: p[0].x, y0: Math.min(p[0].y, p[1].y), y1: Math.max(p[0].y, p[1].y) })
    verticals.push({ id: w.id, x: p[3].x, y0: Math.min(p[2].y, p[3].y), y1: Math.max(p[2].y, p[3].y) })
  }
  // clipSeg ordered along the actual travel direction from → to.
  const orderedClip = (from: Pt, to: Pt) => {
    const subs = clipSeg(from, to, deviceRects)
    const vert = Math.abs(from.x - to.x) < 0.001
    const fromLo = (vert ? from.y : from.x) <= (vert ? to.y : to.x)
    return fromLo ? subs : subs.slice().reverse().map((s) => ({ a: s.b, b: s.a, hidden: s.hidden }))
  }
  // A whole conductor as continuous paths: one casing outline (clean single-line
  // corners via round joins) + colour runs split into solid / behind-breaker(dashed).
  const buildWire = (w: DbWire): { casingD: string; runs: Array<{ d: string; hidden: boolean }> } | null => {
    const pts = wirePts(w)
    if (!pts) return null
    const [A, P1, P2, B] = pts
    const lane = P1.y
    const crosses = verticals
      .filter((v) => v.id !== w.id && v.x > Math.min(P1.x, P2.x) + 0.5 && v.x < Math.max(P1.x, P2.x) - 0.5 && lane > v.y0 + 0.5 && lane < v.y1 - 0.5)
      .map((v) => v.x)
    const casingD = `M ${A.x} ${A.y} L ${P1.x} ${P1.y}` + hopCmds(P1.x, P2.x, lane, crosses, 4) + ` L ${B.x} ${B.y}`
    type Prim = { t: 'L'; a: Pt; b: Pt; hidden: boolean } | { t: 'H'; a: Pt; b: Pt; hidden: boolean; crosses: number[] }
    const prims: Prim[] = []
    for (const s of orderedClip(A, P1)) prims.push({ t: 'L', a: s.a, b: s.b, hidden: s.hidden })
    prims.push({ t: 'H', a: P1, b: P2, hidden: false, crosses })
    for (const s of orderedClip(P2, B)) prims.push({ t: 'L', a: s.a, b: s.b, hidden: s.hidden })
    const runs: Array<{ d: string; hidden: boolean }> = []
    let cur: { d: string; hidden: boolean } | null = null
    for (const p of prims) {
      if (!cur || cur.hidden !== p.hidden) { if (cur) runs.push(cur); cur = { hidden: p.hidden, d: `M ${p.a.x} ${p.a.y}` } }
      cur.d += p.t === 'L' ? ` L ${p.b.x} ${p.b.y}` : hopCmds(p.a.x, p.b.x, p.a.y, p.crosses, 4)
    }
    if (cur) runs.push(cur)
    return { casingD, runs }
  }
  const toWrap = (clientX: number, clientY: number) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    // rect is post-transform (scaled); divide by zoom to get the unscaled SVG coords.
    return rect ? { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom } : { x: 0, y: 0 }
  }

  const startWire = (e: React.PointerEvent, ref: DbTerminalRef, conductor: DbConductor) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const p = toWrap(e.clientX, e.clientY)
    setWireDraft({ from: ref, conductor, x: p.x, y: p.y })
    const onMove = (ev: PointerEvent) => { const q = toWrap(ev.clientX, ev.clientY); setWireDraft((d) => (d ? { ...d, x: q.x, y: q.y } : d)) }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const q = toWrap(ev.clientX, ev.clientY)
      const hit = terminals().map((t) => ({ t, d: Math.hypot(t.x - q.x, t.y - q.y) })).sort((a, b) => a.d - b.d)[0]
      setWireDraft(null)
      if (!hit || hit.d > 16 || sameTerm(hit.t.ref, ref)) return
      const to = hit.t.ref
      const dup = wires.some((w) => (sameTerm(w.from, ref) && sameTerm(w.to, to)) || (sameTerm(w.from, to) && sameTerm(w.to, ref)))
      if (dup) return
      setWires([...wires, { id: mkId('wire'), from: ref, to, conductor }])
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const removeWire = (id: string) => setWires(wires.filter((w) => w.id !== id))

  // Grab a conductor and drag it up/down to set its channel height; a plain click
  // (no drag) deletes it.
  const startLaneDrag = (e: React.PointerEvent, w: DbWire) => {
    if (mode !== 'wiring' || e.button !== 0) return
    e.stopPropagation()
    const base = baseLaneOf(w)
    const top = w.from.end === 'top'
    const reach = channelH + 14   // more channel height → more room to raise conductors
    const lo = top ? -reach : -3
    const hi = top ? 3 : reach
    const startY = e.clientY
    let moved = false
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < 4) return
      moved = true
      const q = toWrap(ev.clientX, ev.clientY)
      const lane = Math.max(lo, Math.min(hi, Math.round(q.y - base)))
      setWires(wires.map((x) => (x.id === w.id ? { ...x, lane } : x)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (!moved) removeWire(w.id)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const boardH = Array.from({ length: rows }, (_, r) => rowH(r)).reduce((a, b) => a + b, 0) + (rows - 1) * RAIL_GAP
  const padY = Math.max(44, channelH + 26)   // top/bottom channel room, grows with channel height

  // ── Sections (named regions that span an area of the board) ──────────────────
  const sections = board.sections ?? []
  const setSections = (next: DbSection[]) => setBoard({ sections: next })
  const patchSection = (id: string, p: Partial<DbSection>) => setSections(sections.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const removeSection = (id: string) => { setSections(sections.filter((s) => s.id !== id)); setSelectedSection((v) => (v === id ? null : v)) }
  const addSection = () => { const s = defaultDbSection(0, 0, Math.min(ways, 4)); setSections([...sections, s]); setSelectedSection(s.id) }
  // Pixel rect for a section spanning rows × ways.
  const sectionRect = (s: DbSection) => {
    const r0 = Math.max(0, Math.min(rows - 1, s.row))
    const rEnd = Math.max(r0, Math.min(rows - 1, s.row + s.rowSpan - 1))
    let height = 0
    for (let i = r0; i <= rEnd; i++) height += rowH(i) + (i < rEnd ? RAIL_GAP : 0)
    return { left: s.startWay * MODULE_PX, top: railTop(r0), width: Math.min(ways - s.startWay, s.waySpan) * MODULE_PX, height }
  }

  // Arrow (not a hoisted `function`) so TS keeps the `board` non-null narrowing.
  const autoArrange = () => {
    const res = autoArrangeDb(comps, ways, rows, phases)
    setBoard({ components: res.components, rows: res.rows })
    if (res.rows > rows) flash(`Grew the board to ${res.rows} rails to fit everything.`)
  }

  function addHere(kind: DbComponentKind, label: string, productId: string | null) {
    if (!addAt) return
    const width = Math.min(ways, dbModuleWidth(kind, phases))
    const start = fits(addAt.row, addAt.startWay, width) ? addAt.startWay : firstGap(addAt.row, width, addAt.startWay)
    const comp = defaultDbComponent(kind)
    comp.label = label.trim() || dbComponentKind(kind).label
    comp.productId = productId
    comp.slot = start === null ? undefined : { row: addAt.row, startWay: start, width }
    setComponents([...comps, comp])
    setAddAt(null)
    if (start === null) flash('Rail was full — added the device to the tray instead.')
  }

  const selected = selectedId ? comps.find((c) => c.id === selectedId) ?? null : null

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <LayoutGrid className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-foreground">{board.label || 'Distribution board'}</span>
          <span className="hidden sm:inline text-xs text-muted-foreground">· physical layout</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Layout ↔ Wiring mode: place breakers, or draw coloured conductors. */}
          <div className="mr-1 flex items-center rounded-md border border-border p-0.5">
            <button type="button" onClick={() => { setMode('layout'); setWireDraft(null) }}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold ${mode === 'layout' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <MousePointer2 className="h-3.5 w-3.5" /> Layout
            </button>
            <button type="button" onClick={() => { setMode('wiring'); setSelectedId(null) }}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold ${mode === 'wiring' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Cable className="h-3.5 w-3.5" /> Wiring
            </button>
          </div>
          {mode === 'wiring' ? (
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              3-phase
              <select value={phaseSet} onChange={(e) => setBoard({ phaseColors: e.target.value as PhaseColorSet })}
                className="h-7 rounded border border-border bg-background px-1 text-[11px]">
                {(Object.keys(DB_PHASE_SETS) as PhaseColorSet[]).map((k) => <option key={k} value={k}>{DB_PHASE_SETS[k].label}</option>)}
              </select>
            </label>
          ) : (<>
            {/* Ways / rows are fully adjustable right here. */}
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Ways
              <input type="number" min={1} max={48} value={ways}
                onChange={(e) => setBoard({ ways: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                className="h-7 w-14 rounded border border-border bg-background px-1.5 text-xs" />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Rails
              <input type="number" min={1} max={12} value={rows}
                onChange={(e) => setBoard({ rows: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                className="h-7 w-14 rounded border border-border bg-background px-1.5 text-xs" />
            </label>
            <button type="button" onClick={() => setAddAt(firstFreeSlot())}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Plus className="h-3.5 w-3.5" /> Add breaker
            </button>
            <button type="button" onClick={addSection}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <BoxSelect className="h-3.5 w-3.5" /> Add section
            </button>
            <button type="button" onClick={autoArrange}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
              <Wand2 className="h-3.5 w-3.5" /> Auto-arrange
            </button>
          </>)}
          {/* Spacing: module width + channel (vertical routing room) */}
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Module width — spread circuits out horizontally">
            <MoveHorizontal className="h-3.5 w-3.5" />
            <input type="range" min={24} max={64} step={2} value={moduleW} onChange={(e) => setModuleW(Number(e.target.value))} className="w-16" />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Channel height — vertical room for stacking cables">
            <MoveVertical className="h-3.5 w-3.5" />
            <input type="range" min={12} max={64} step={2} value={channelH} onChange={(e) => setChannelH(Number(e.target.value))} className="w-16" />
          </label>
          {/* Zoom */}
          <div className="flex items-center rounded-md border border-border">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))} title="Zoom out" className="px-1.5 py-1 text-muted-foreground hover:text-foreground"><ZoomOut className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setZoom(1)} title="Reset zoom" className="w-11 text-center text-[11px] tabular-nums text-muted-foreground hover:text-foreground">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))} title="Zoom in" className="px-1.5 py-1 text-muted-foreground hover:text-foreground"><ZoomIn className="h-3.5 w-3.5" /></button>
          </div>
          <button type="button" onClick={printSchedule(board, phases)}
            title="Print / save a panel schedule for the workshop"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <Printer className="h-3.5 w-3.5" /> Schedule
          </button>
          <button type="button" onClick={onClose} title="Close (Esc)"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Close
          </button>
        </div>
      </div>

      {/* Status strip */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-1.5 text-[11px] text-muted-foreground">
        <span><span className="font-semibold text-foreground">{usedModules}</span> of {capacity} spaces used · {free} free</span>
        {offBoard.length > 0 && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> {offBoard.length} device{offBoard.length === 1 ? '' : 's'} off the board — Auto-arrange or add rails.
          </span>
        )}
        {note && <span className="text-primary">{note}</span>}
        {mode === 'wiring' ? (
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <LegendSwatch color={dbConductorColor('L', phaseSet)} label="Live" />
            <LegendSwatch color={dbConductorColor('N', phaseSet)} label="Neutral" />
            <LegendSwatch color="#16a34a" earth label="Earth" />
            <span className="text-border">·</span>
            <LegendSwatch color={dbConductorColor('L1', phaseSet)} label="L1" />
            <LegendSwatch color={dbConductorColor('L2', phaseSet)} label="L2" />
            <LegendSwatch color={dbConductorColor('L3', phaseSet)} label="L3" />
            <span className="hidden lg:inline text-muted-foreground/70">— draw terminal → terminal · drag a cable up/down to raise it · click to delete</span>
          </div>
        ) : (
          <span className="ml-auto hidden md:inline text-muted-foreground/70">Click a space to add · drag to slide &amp; push others aside · click a device to edit</span>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto p-6">
        <div style={{ height: (boardH + 2 * padY + 4) * zoom, display: 'flex', justifyContent: 'center', minWidth: 'min-content' }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <div className="rounded-xl border-2 border-border bg-card px-4 shadow-sm" style={{ paddingTop: padY, paddingBottom: padY }}>
              <div ref={wrapRef} className="relative" style={{ width: railWidth, height: boardH }}>
            {/* Rails */}
            <div className="flex flex-col" style={{ gap: RAIL_GAP }}>
              {Array.from({ length: rows }, (_, row) => {
                const isTarget = drag && preview && preview.row === row
                return (
                <div
                  key={row}
                  ref={(el) => { railRefs.current[row] = el }}
                  className={`relative rounded-md border bg-muted/30 ${isTarget ? 'border-primary/60 bg-primary/5' : 'border-border'}`}
                  style={{ width: railWidth, height: rowH(row) }}
                >
                  {/* Empty module cells — click a free one to add a device there (Layout mode). */}
                  <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${ways}, ${MODULE_PX}px)`, gridTemplateRows: '100%' }}>
                    {Array.from({ length: ways }, (_, w) => {
                      const occupied = onBoard.some((c) => c.id !== drag?.id && c.slot!.row === row && w >= c.slot!.startWay && w < c.slot!.startWay + c.slot!.width)
                      const off = occupied || !!drag || mode === 'wiring'
                      return (
                        <button
                          key={w}
                          type="button"
                          disabled={off}
                          onClick={() => setAddAt({ row, startWay: w })}
                          title={off ? undefined : `Add a device at rail ${row + 1}, space ${w + 1}`}
                          className={`border-r border-dashed border-border/60 last:border-r-0 ${off ? 'cursor-default' : 'hover:bg-primary/10'}`}
                        />
                      )
                    })}
                  </div>
                  {/* DIN rail line */}
                  <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 bg-border/70" />
                  {/* Height handle — drag this rail's bottom edge to make it taller / shorter */}
                  <div
                    onPointerDown={(e) => startRowResize(e, row)}
                    title="Drag to change this rail's height"
                    className="group absolute -bottom-1.5 left-0 right-0 z-20 flex h-3 cursor-ns-resize items-center justify-center"
                  >
                    <div className="h-1 w-10 rounded-full bg-border group-hover:bg-primary" />
                  </div>
                  {/* Placed devices (the one being dragged is shown as the floating ghost) */}
                  {onBoard.filter((c) => c.slot!.row === row && c.id !== drag?.id).map((c) => {
                    const color = kindColor(c.kind)
                    return (
                      <div
                        key={c.id}
                        onPointerDown={mode === 'layout' ? (e) => startDrag(e, c) : undefined}
                        title={mode === 'layout' ? `${c.label} — drag to move, click to edit` : c.label}
                        className={`absolute top-1 bottom-1 flex touch-none select-none flex-col items-center justify-center overflow-hidden rounded-sm px-0.5 text-center ${mode === 'layout' ? 'cursor-grab' : 'cursor-default'} ${selectedId === c.id ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                        style={{ left: renderStart(c) * MODULE_PX + 1, width: c.slot!.width * MODULE_PX - 2, background: `${color}1f`, borderTop: `3px solid ${color}`, transition: drag ? 'left 130ms ease' : undefined }}
                      >
                        <span className="text-[9px] font-bold leading-none" style={{ color }}>{KIND_ABBR[c.kind] ?? ''}</span>
                        <span className="mt-0.5 line-clamp-2 text-[8px] leading-tight text-foreground/80">{c.label}</span>
                      </div>
                    )
                  })}
                </div>
              )})}
            </div>

            {/* Sections — translucent named regions spanning an area. The band is
                click-through; the label chip selects it (Layout mode). */}
            {sections.map((s) => {
              const rect = sectionRect(s)
              const col = s.color || '#6366f1'
              const sel = selectedSection === s.id
              return (
                <div key={s.id} className="pointer-events-none absolute rounded-md" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, background: `${col}14`, border: `1.5px ${sel ? 'solid' : 'dashed'} ${col}`, zIndex: 5 }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedSection(sel ? null : s.id) }}
                    className="pointer-events-auto absolute -top-2 left-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                    style={{ background: col }}
                  >
                    {s.label || 'Section'}
                  </button>
                </div>
              )
            })}

            {/* Wiring overlay — coloured conductors + terminals, drawn over the rails. */}
            <svg className="absolute inset-0" width={railWidth} height={boardH} style={{ pointerEvents: 'none', overflow: 'visible' }}>
              {wires.map((w) => {
                const g = buildWire(w)
                if (!g) return null
                const col = dbConductorColor(w.conductor, phaseSet)
                const active = hoverWire === w.id
                const cw = active ? 4 : 3
                const casing = casingColor(col)
                return (
                  <g key={w.id}>
                    {/* One continuous casing outline → clean single-line corners */}
                    <path d={g.casingD} fill="none" stroke={casing} strokeWidth={cw + 3} strokeLinecap="round" strokeLinejoin="round" />
                    {/* Colour, split into solid runs and behind-breaker (dashed) runs */}
                    {g.runs.map((r, i) => (
                      <g key={i}>
                        <path d={r.d} fill="none" stroke={col} strokeWidth={cw} strokeLinecap="round" strokeLinejoin="round"
                          strokeDasharray={r.hidden ? '3 3' : undefined} opacity={r.hidden ? 0.35 : 1} />
                        {w.conductor === 'E' && !r.hidden && (
                          <path d={r.d} fill="none" stroke="#facc15" strokeWidth={active ? 2 : 1.5} strokeDasharray="3 4" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                      </g>
                    ))}
                    {/* Fat invisible hit path: drag up/down to raise the conductor, click to delete */}
                    <path d={g.casingD} fill="none" stroke="transparent" strokeWidth={13}
                      style={{ pointerEvents: mode === 'wiring' ? 'stroke' : 'none', cursor: mode === 'wiring' ? 'ns-resize' : 'default' }}
                      onPointerDown={(e) => startLaneDrag(e, w)}
                      onMouseEnter={() => setHoverWire(w.id)} onMouseLeave={() => setHoverWire((h) => (h === w.id ? null : h))}>
                      <title>{dbConductorLabel(w.conductor)} — drag up/down to raise · click to delete</title>
                    </path>
                  </g>
                )
              })}
              {wireDraft && (() => {
                const a = refPos(wireDraft.from)
                if (!a) return null
                const col = dbConductorColor(wireDraft.conductor, phaseSet)
                return <path d={`M ${a.x} ${a.y} L ${wireDraft.x} ${wireDraft.y}`} fill="none" stroke={col} strokeWidth={3} strokeDasharray="5 3" strokeLinecap="round" />
              })()}
              {mode === 'wiring' && terminals().map((t, i) => {
                const fill = t.conductor === 'E' ? '#16a34a' : dbConductorColor(t.conductor, phaseSet)
                return (
                <circle
                  key={i}
                  cx={t.x} cy={t.y} r={TERM_R}
                  fill={fill}
                  stroke={casingColor(fill)} strokeWidth={1.5}
                  style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
                  // eslint-disable-next-line react-hooks/refs -- startWire reads wrapRef only inside pointer handlers; this arrow just closes over it, it is never called during render.
                  onPointerDown={(e) => startWire(e, t.ref, t.conductor)}
                >
                  <title>{dbConductorLabel(t.conductor)} · {t.ref.end}{t.ref.pole === DB_EARTH_POLE ? '' : ` pole ${t.ref.pole + 1}`}</title>
                </circle>
              )})}
            </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tray — devices not yet on the board. Also a drop target: drag here to unplace. */}
        {(unplaced.length > 0 || offBoard.length > 0 || drag) && (
          <div
            ref={trayRef}
            className={`mx-auto mt-4 max-w-[900px] rounded-lg border border-dashed p-3 transition-colors ${drag && preview?.row === -1 ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {drag ? 'Drop here to take a device off the board' : `Not placed (${unplaced.length + offBoard.length}) — drag onto a rail`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[...unplaced, ...offBoard].filter((c) => c.id !== drag?.id).map((c) => {
                const color = kindColor(c.kind)
                return (
                  <div
                    key={c.id}
                    onPointerDown={(e) => startDrag(e, c)}
                    className={`flex cursor-grab touch-none select-none items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${selectedId === c.id ? 'ring-2 ring-primary' : ''}`}
                    style={{ borderColor: color, background: `${color}14` }}
                  >
                    <span className="font-bold" style={{ color }}>{KIND_ABBR[c.kind] ?? ''}</span>
                    <span className="text-foreground/80">{c.label}</span>
                  </div>
                )
              })}
              {[...unplaced, ...offBoard].filter((c) => c.id !== drag?.id).length === 0 && (
                <span className="text-[11px] text-muted-foreground/70">Tray is empty.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating ghost — the device being dragged, tracking the cursor. */}
      {drag && (
        <div
          className="pointer-events-none fixed flex flex-col items-center justify-center rounded-sm px-0.5 text-center shadow-lg"
          style={{
            left: drag.x - drag.ox, top: drag.y - (ROW_H * zoom) / 2,
            width: (drag.width * MODULE_PX - 2) * zoom, height: (ROW_H - 8) * zoom, zIndex: 10050,
            background: `${drag.color}33`, borderTop: `3px solid ${drag.color}`,
          }}
        >
          <span className="text-[9px] font-bold leading-none" style={{ color: drag.color }}>{KIND_ABBR[drag.kind] ?? ''}</span>
          <span className="mt-0.5 line-clamp-2 text-[8px] leading-tight text-foreground/80">{drag.label}</span>
        </div>
      )}

      {/* Add-a-device popover */}
      {addAt && (
        <AddDevice
          items={items}
          onCancel={() => setAddAt(null)}
          onAdd={addHere}
          where={`rail ${addAt.row + 1}, space ${addAt.startWay + 1}`}
        />
      )}

      {/* Selected-device inspector */}
      {selected && (
        <DeviceInspector
          key={selected.id}
          comp={selected}
          items={items}
          maxWidth={ways}
          poles={compPoles(selected)}
          earth={compEarth(selected)}
          onClose={() => setSelectedId(null)}
          onPatch={(p) => patchComponent(selected.id, p)}
          onUnplace={() => { patchComponent(selected.id, { slot: undefined }) }}
          onRemove={() => { removeComponent(selected.id); setSelectedId(null) }}
        />
      )}

      {/* Section inspector */}
      {(() => {
        const sec = selectedSection ? sections.find((s) => s.id === selectedSection) ?? null : null
        if (!sec) return null
        const num = (label: string, value: number, min: number, max: number, on: (v: number) => void) => (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <input type="number" min={min} max={max} value={value} onChange={(e) => on(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || min))))} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
        )
        return (
          <div className="fixed right-0 top-[92px] bottom-0 z-[10001] w-72 overflow-y-auto border-l border-border bg-card p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Section</span>
              <button type="button" onClick={() => setSelectedSection(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-col gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Label</span>
                <input value={sec.label} onChange={(e) => patchSection(sec.id, { label: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Colour</span>
                <input type="color" value={sec.color || '#6366f1'} onChange={(e) => patchSection(sec.id, { color: e.target.value })} className="h-8 w-12 rounded border border-border bg-background" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {num('From rail', sec.row + 1, 1, rows, (v) => patchSection(sec.id, { row: v - 1 }))}
                {num('Rails tall', sec.rowSpan, 1, rows, (v) => patchSection(sec.id, { rowSpan: v }))}
                {num('From space', sec.startWay + 1, 1, ways, (v) => patchSection(sec.id, { startWay: v - 1 }))}
                {num('Spaces wide', sec.waySpan, 1, ways, (v) => patchSection(sec.id, { waySpan: v }))}
              </div>
            </div>
            <button type="button" onClick={() => removeSection(sec.id)} className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Remove section
            </button>
          </div>
        )
      })()}
    </div>
  )
}

// Small colour key used in the wiring-mode legend.
function LegendSwatch({ color, label, earth }: { color: string; label: string; earth?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-2.5 w-4 rounded-sm"
        style={{ background: earth ? 'repeating-linear-gradient(45deg,#16a34a,#16a34a 3px,#facc15 3px,#facc15 6px)' : color, border: '1px solid rgba(100,116,139,0.5)' }}
      />
      <span className="text-foreground/70">{label}</span>
    </span>
  )
}

// ── Add-a-device popover ──────────────────────────────────────────────────────
function AddDevice({
  items, where, onAdd, onCancel,
}: {
  items: ReturnType<typeof useCatalog>['items']
  where: string
  onAdd: (kind: DbComponentKind, label: string, productId: string | null) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<DbComponentKind>('breaker')
  const [label, setLabel] = useState('')
  const [productId, setProductId] = useState<string | null>(null)
  const def = dbComponentKind(kind)
  const placeholder = def.label

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-[360px] rounded-lg border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add device — {where}</span>
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as DbComponentKind)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              {DB_COMPONENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <ProductPicker items={items} category={def.category} label="Product (optional)" value={productId} onChange={setProductId} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          <button type="button" onClick={() => onAdd(kind, label, productId)} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Selected-device inspector (right rail) ────────────────────────────────────
function DeviceInspector({
  comp, items, maxWidth, poles, earth, onPatch, onUnplace, onRemove, onClose,
}: {
  comp: DbComponent
  items: ReturnType<typeof useCatalog>['items']
  maxWidth: number
  poles: number
  earth: boolean
  onPatch: (p: Partial<DbComponent>) => void
  onUnplace: () => void
  onRemove: () => void
  onClose: () => void
}) {
  const def = dbComponentKind(comp.kind)
  const width = comp.slot?.width ?? dbModuleWidth(comp.kind)
  const setWidth = (w: number) => {
    const nw = Math.max(1, Math.min(maxWidth, Math.round(w)))
    onPatch({ slot: comp.slot ? { ...comp.slot, width: nw } : { row: 0, startWay: 0, width: nw } })
  }
  const setPoles = (p: number) => onPatch({ poles: Math.max(1, Math.min(4, Math.round(p))) })
  const poleConductors = poles <= 1 ? 'Live' : poles === 2 ? 'Live + Neutral' : poles === 3 ? 'L1 / L2 / L3' : 'L1 / L2 / L3 + N'
  return (
    <div className="fixed right-0 top-[92px] bottom-0 z-[10001] w-72 overflow-y-auto border-l border-border bg-card p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Device</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Type</span>
          <select
            value={comp.kind}
            onChange={(e) => {
              const nk = e.target.value as DbComponentKind
              const nd = dbComponentKind(nk)
              const label = (!comp.label.trim() || comp.label === def.label) ? nd.label : comp.label
              onPatch({ kind: nk, label, fedFrom: comp.fedFrom.slice(0, nd.inputs) })
            }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {DB_COMPONENT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Label</span>
          <input value={comp.label} onChange={(e) => onPatch({ label: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Width (spaces / poles)</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setWidth(width - 1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
            <input type="number" min={1} max={maxWidth} value={width} onChange={(e) => setWidth(Number(e.target.value) || 1)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-center text-sm" />
            <button type="button" onClick={() => setWidth(width + 1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </label>
        <ProductPicker items={items} category={def.category} label="Product" value={comp.productId} onChange={(v) => onPatch({ productId: v })} />
      </div>

      {/* Wiring — how many poles (terminals) and whether it has an earth point. */}
      <div className="mt-3 rounded-md border border-border p-2">
        <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Cable className="h-3 w-3" /> Wiring</p>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Poles (terminals) — {poleConductors}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPoles(poles - 1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
            <input type="number" min={1} max={4} value={poles} onChange={(e) => setPoles(Number(e.target.value) || 1)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-center text-sm" />
            <button type="button" onClick={() => setPoles(poles + 1)} className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs text-foreground">
          <input type="checkbox" checked={earth} onChange={(e) => onPatch({ earth: e.target.checked })} className="h-4 w-4 rounded border-border" />
          Earth terminal (green/yellow)
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        {comp.slot && (
          <button type="button" onClick={onUnplace} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <CornerUpLeft className="h-3.5 w-3.5" /> Move to tray (unplace)
          </button>
        )}
        <button type="button" onClick={onRemove} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> Remove device
        </button>
      </div>
    </div>
  )
}

// ── Printable panel schedule (opens in its own window so app styles don't leak) ──
function printSchedule(board: AcCombiner | DcCombiner, phases: number) {
  return () => {
    const ways = Math.max(1, Math.round(board.ways || 12))
    const placed = expandDbUnits(board.components ?? [])
      .filter((c) => c.slot)
      .sort((a, b) => (a.slot!.row - b.slot!.row) || (a.slot!.startWay - b.slot!.startWay))
    const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string))
    const rowsHtml = placed.map((c) => {
      const from = c.slot!.startWay + 1
      const to = c.slot!.startWay + c.slot!.width
      const range = from === to ? `${from}` : `${from}–${to}`
      return `<tr><td>${c.slot!.row + 1}</td><td>${range}</td><td>${dbComponentKind(c.kind).label}</td><td>${esc(c.label)}</td><td>${c.slot!.width}</td></tr>`
    }).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Panel schedule — ${esc(board.label || 'Distribution board')}</title>
      <style>
        body{font:13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px}
        h1{font-size:18px;margin:0 0 4px} .meta{color:#555;margin-bottom:16px}
        table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
        th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      </style></head><body>
      <h1>Panel schedule — ${esc(board.label || 'Distribution board')}</h1>
      <div class="meta">${board.productCode ? esc(board.productCode) + ' · ' : ''}${ways}-way${(board.rows || 1) > 1 ? ` × ${board.rows} rails` : ''} · ${phases}-phase</div>
      <table><thead><tr><th>Rail</th><th>Space</th><th>Device</th><th>Label</th><th>Poles</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="5">No devices placed yet.</td></tr>'}</tbody></table>
      </body></html>`
    const w = window.open('', '_blank', 'width=820,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }
}
