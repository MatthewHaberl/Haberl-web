import type { Node, Edge } from '@xyflow/react'
import type { QuoteData } from './render-quote'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNum(s: string | null | undefined): number {
  if (!s) return 0
  const m = s.match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

function inferStringCount(dcCombinerConfig: string, panelCount: number): number {
  if (!dcCombinerConfig) return Math.max(1, Math.min(Math.ceil(panelCount / 7), 4))
  const m1 = dcCombinerConfig.match(/(\d+)[\s-]?(?:string|way|input|port)/i)
  if (m1) return Math.min(parseInt(m1[1]), 6)
  const m2 = dcCombinerConfig.match(/(\d+)\s*[×x*]\s*mppt/i)
  if (m2) return Math.min(parseInt(m2[1]) * 2, 6)
  if (/single|1\s*mppt|no combiner/i.test(dcCombinerConfig)) return 1
  return Math.max(1, Math.min(Math.ceil(panelCount / 7), 4))
}

function cableSpecs(kw: number) {
  if (kw <= 3) return { dcStr: 'H1Z2Z2 4mm²', dcMain: 'H1Z2Z2 4mm²', bat: 'CU 16mm²', ac: 'CU 6mm²' }
  if (kw <= 5) return { dcStr: 'H1Z2Z2 4mm²', dcMain: 'H1Z2Z2 6mm²', bat: 'CU 25mm²', ac: 'CU 6mm²' }
  if (kw <= 8) return { dcStr: 'H1Z2Z2 6mm²', dcMain: 'H1Z2Z2 6mm²', bat: 'CU 35mm²', ac: 'CU 10mm²' }
  return { dcStr: 'H1Z2Z2 6mm²', dcMain: 'H1Z2Z2 10mm²', bat: 'CU 50mm²', ac: 'CU 16mm²' }
}

function conductors(type: 'dc' | 'ac1p' | 'ac3p' | 'battery' | 'earth'): string {
  if (type === 'dc') return '+/−'
  if (type === 'ac1p') return 'L/N/E'
  if (type === 'ac3p') return 'L1/L2/L3/N/E'
  if (type === 'battery') return '+/−'
  return 'E'
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CableEdgeData extends Record<string, unknown> {
  spec: string
  lengthM: number
  circuitType: 'dc' | 'ac' | 'battery' | 'earth'
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildSLDFromQuote(
  quote: QuoteData,
  gridSupply?: string,
): { nodes: Node[]; edges: Edge[] } {
  const kw = parseNum(quote.inverterKw)
  const kwp = parseNum(quote.totalKwp)
  const panelCount = parseInt(quote.panelCount) || 0
  const batteryQty = parseInt(quote.batteryQty) || 1
  const batteryKwh = parseNum(quote.batteryKwh)
  const is3Phase =
    gridSupply?.toLowerCase().includes('three') ||
    gridSupply?.toLowerCase().includes('3 phase') ||
    kw >= 10

  const stringCount = inferStringCount(quote.dcCombinerConfig || '', panelCount)
  const useCombiner = stringCount > 1
  const specs = cableSpecs(kw)

  const panelsPerStr = panelCount > 0 ? Math.ceil(panelCount / stringCount) : 0
  const wpPerPanel =
    panelCount > 0 && kwp > 0 ? Math.round((kwp * 1000) / panelCount) : 0

  const acCond = conductors(is3Phase ? 'ac3p' : 'ac1p')

  // ── Layout ──────────────────────────────────────────────────────────────────
  const CX = 400
  const ARRAY_GAP = 280
  const totalArraySpan = (stringCount - 1) * ARRAY_GAP
  const arrayStartX = CX - totalArraySpan / 2

  const Y0 = 0
  const Y1 = 240
  const Y_INV = useCombiner ? 490 : 260
  const Y_DB = Y_INV + 260
  const Y_EARTH = Y_DB

  const nodes: Node[] = []
  const edges: Edge[] = []

  // ── Solar Arrays ────────────────────────────────────────────────────────────
  for (let i = 0; i < stringCount; i++) {
    const x = arrayStartX + i * ARRAY_GAP - 110
    nodes.push({
      id: `array-${i}`,
      type: 'solarArray',
      position: { x, y: Y0 },
      data: {
        label: stringCount > 1 ? `String ${i + 1}` : 'Solar Array',
        panelCount: panelsPerStr,
        panelModel: quote.panelModel || '',
        wpPerPanel,
        totalKwp: kwp > 0 ? +(kwp / stringCount).toFixed(1) : 0,
        config: panelsPerStr > 0 ? `${panelsPerStr}S` : '',
      },
    })
  }

  // ── DC Combiner ─────────────────────────────────────────────────────────────
  if (useCombiner) {
    nodes.push({
      id: 'combiner',
      type: 'combiner',
      position: { x: CX - 110, y: Y1 },
      data: {
        label: 'DC Combiner Box',
        stringCount,
        fuseRating: kw <= 5 ? '20A' : '32A',
        hasSpd: true,
        config: quote.dcCombinerConfig || `${stringCount}-string`,
      },
    })

    for (let i = 0; i < stringCount; i++) {
      edges.push({
        id: `e-arr${i}-comb`,
        source: `array-${i}`,
        target: 'combiner',
        sourceHandle: 'dc-out',
        targetHandle: `str-${i}`,
        type: 'cable',
        data: { spec: specs.dcStr, lengthM: 12, circuitType: 'dc' } as CableEdgeData,
        label: `${specs.dcStr} · ${conductors('dc')} · ~12m`,
      })
    }
  }

  // ── Inverter ─────────────────────────────────────────────────────────────────
  nodes.push({
    id: 'inverter',
    type: 'inverter',
    position: { x: CX - 130, y: Y_INV },
    data: {
      label: 'Inverter',
      model: quote.inverterModel || '',
      kw,
      phases: is3Phase ? 3 : 1,
      hasBattery: !!quote.batteryModel,
      hasGenerator: false,
    },
  })

  // PV source → Inverter
  if (useCombiner) {
    edges.push({
      id: 'e-comb-inv',
      source: 'combiner',
      target: 'inverter',
      sourceHandle: 'dc-out',
      targetHandle: 'pv-in',
      type: 'cable',
      data: { spec: specs.dcMain, lengthM: 8, circuitType: 'dc' } as CableEdgeData,
      label: `${specs.dcMain} · ${conductors('dc')} · ~8m`,
    })
  } else {
    edges.push({
      id: 'e-arr0-inv',
      source: 'array-0',
      target: 'inverter',
      sourceHandle: 'dc-out',
      targetHandle: 'pv-in',
      type: 'cable',
      data: { spec: specs.dcStr, lengthM: 15, circuitType: 'dc' } as CableEdgeData,
      label: `${specs.dcStr} · ${conductors('dc')} · ~15m`,
    })
  }

  // ── Battery ──────────────────────────────────────────────────────────────────
  if (quote.batteryModel) {
    nodes.push({
      id: 'battery',
      type: 'battery',
      position: { x: CX - 430, y: Y_INV + 20 },
      data: {
        label: 'Battery Bank',
        model: quote.batteryModel,
        qty: batteryQty,
        totalKwh: batteryKwh,
        chemistry: 'LiFePO4',
      },
    })
    edges.push({
      id: 'e-bat-inv',
      source: 'battery',
      target: 'inverter',
      sourceHandle: 'bat-out',
      targetHandle: 'bat-in',
      type: 'cable',
      data: { spec: specs.bat, lengthM: 3, circuitType: 'battery' } as CableEdgeData,
      label: `${specs.bat} · ${conductors('battery')} · ~3m`,
    })
  }

  // ── Grid Supply ──────────────────────────────────────────────────────────────
  nodes.push({
    id: 'grid',
    type: 'grid',
    position: { x: CX + 360, y: Y_INV + 20 },
    data: {
      label: 'Grid Supply',
      utility: quote.municipality || 'Eskom',
      voltage: is3Phase ? 400 : 230,
      phases: is3Phase ? 3 : 1,
      breakerA: is3Phase ? 63 : 63,
    },
  })
  edges.push({
    id: 'e-grid-inv',
    source: 'grid',
    target: 'inverter',
    sourceHandle: 'ac-out',
    targetHandle: 'grid-in',
    type: 'cable',
    data: { spec: specs.ac, lengthM: 5, circuitType: 'ac' } as CableEdgeData,
    label: `${specs.ac} · ${acCond} · ~5m`,
  })

  // ── Distribution Board ───────────────────────────────────────────────────────
  nodes.push({
    id: 'db',
    type: 'dbBoard',
    position: { x: CX - 110, y: Y_DB },
    data: {
      label: 'Distribution Board',
      mainBreakerA: is3Phase ? 63 : 40,
      rccbA: 30,
      phases: is3Phase ? 3 : 1,
    },
  })
  edges.push({
    id: 'e-inv-db',
    source: 'inverter',
    target: 'db',
    sourceHandle: 'ac-out',
    targetHandle: 'ac-in',
    type: 'cable',
    data: { spec: specs.ac, lengthM: 8, circuitType: 'ac' } as CableEdgeData,
    label: `${specs.ac} · ${acCond} · ~8m`,
  })

  // ── Earthing System ──────────────────────────────────────────────────────────
  const earthSpikes = kw <= 3 ? 2 : kw <= 6 ? 2 : kw <= 10 ? 3 : 4
  nodes.push({
    id: 'earth',
    type: 'earthing',
    position: { x: CX + 360, y: Y_EARTH },
    data: {
      label: 'Earthing System',
      spikeCount: earthSpikes,
      spec: 'CU GY 10mm²',
    },
  })
  edges.push({
    id: 'e-db-earth',
    source: 'db',
    target: 'earth',
    sourceHandle: 'earth-out',
    targetHandle: 'earth-in',
    type: 'cable',
    data: { spec: 'CU GY 10mm²', lengthM: 5, circuitType: 'earth' } as CableEdgeData,
    label: `CU GY 10mm² · E`,
  })

  return { nodes, edges }
}
