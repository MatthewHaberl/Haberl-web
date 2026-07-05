/**
 * SANS 10142-1:2024 Ed 3.2 voltage-drop tables (mV/A/m at 70 °C conductor temp).
 *
 * Transcribed from tables 6.2(b), 6.3(b), 6.4(b) — copper conductors.
 * Small sizes publish a single impedance value; 25 mm² and up publish
 * r/x/z triples. Single-phase values already account for the return path.
 * Decimal commas in the source are '.' here; null = not applicable (—).
 * Aluminium/rubber batch (6.5(b)–6.9(b)) is generated — voltage-drop-extra.ts.
 */
import { VD_CABLE_TYPES_EXTRA } from './voltage-drop-extra'

export type VdValue = number | { r: number; x: number; z: number } | null

export interface VdRow {
  size: number
  /** mV/A/m per circuit-arrangement key. */
  values: Record<string, VdValue>
}

export interface VdArrangement {
  id: string
  label: string
  phases: 1 | 3 | 0 // 0 = d.c.
}

export interface VdCableType {
  id: string
  label: string
  table: string
  clauseRef: string
  arrangements: VdArrangement[]
  rows: VdRow[]
}

/** Table 6.2(b) — Single-core PVC insulated cables, unarmoured (SANS 1507). */
const SINGLE_CORE_PVC: VdCableType = {
  id: 'single-pvc',
  label: 'Single-core PVC, unarmoured (SANS 1507)',
  table: '6.2(b)',
  clauseRef: '6.2.7',
  arrangements: [
    { id: 'dc', label: 'd.c. — two cables', phases: 0 },
    { id: '1ph_m12', label: 'Single-phase — methods 1 & 2 (in conduit, in/on wall)', phases: 1 },
    { id: '1ph_m34', label: 'Single-phase — methods 3 & 4 (clipped direct / tray, touching)', phases: 1 },
    { id: '1ph_m5', label: 'Single-phase — method 5 (spaced, free air)', phases: 1 },
    { id: '3ph_m12', label: 'Three-phase — methods 1 & 2 (in conduit, in/on wall)', phases: 3 },
    { id: '3ph_trefoil', label: 'Three-phase — trefoil (methods 3, 4 & 5)', phases: 3 },
    { id: '3ph_flat', label: 'Three-phase — flat & touching (methods 3 & 4)', phases: 3 },
    { id: '3ph_spaced', label: 'Three-phase — flat, spaced (method 5)', phases: 3 },
  ],
  rows: [
    { size: 1,   values: { dc: 44,  '1ph_m12': 44, '1ph_m34': 44, '1ph_m5': 44, '3ph_m12': 38, '3ph_trefoil': 38, '3ph_flat': 38, '3ph_spaced': 38 } },
    { size: 1.5, values: { dc: 29,  '1ph_m12': 29, '1ph_m34': 29, '1ph_m5': 29, '3ph_m12': 25, '3ph_trefoil': 25, '3ph_flat': 25, '3ph_spaced': 25 } },
    { size: 2.5, values: { dc: 18,  '1ph_m12': 18, '1ph_m34': 18, '1ph_m5': 18, '3ph_m12': 15, '3ph_trefoil': 15, '3ph_flat': 15, '3ph_spaced': 15 } },
    { size: 4,   values: { dc: 11,  '1ph_m12': 11, '1ph_m34': 11, '1ph_m5': 11, '3ph_m12': 9.5, '3ph_trefoil': 9.5, '3ph_flat': 9.5, '3ph_spaced': 9.5 } },
    { size: 6,   values: { dc: 7.3, '1ph_m12': 7.3, '1ph_m34': 7.3, '1ph_m5': 7.3, '3ph_m12': 6.4, '3ph_trefoil': 6.4, '3ph_flat': 6.4, '3ph_spaced': 6.4 } },
    { size: 10,  values: { dc: 4.4, '1ph_m12': 4.4, '1ph_m34': 4.4, '1ph_m5': 4.4, '3ph_m12': 3.8, '3ph_trefoil': 3.8, '3ph_flat': 3.8, '3ph_spaced': 3.8 } },
    { size: 16,  values: { dc: 2.8, '1ph_m12': 2.8, '1ph_m34': 2.8, '1ph_m5': 2.8, '3ph_m12': 2.4, '3ph_trefoil': 2.4, '3ph_flat': 2.4, '3ph_spaced': 2.4 } },
    { size: 25,  values: { dc: 1.75, '1ph_m12': { r: 1.80, x: 0.33, z: 1.80 }, '1ph_m34': { r: 1.75, x: 0.20, z: 1.75 }, '1ph_m5': { r: 1.75, x: 0.29, z: 1.80 }, '3ph_m12': { r: 1.50, x: 0.29, z: 1.55 }, '3ph_trefoil': { r: 1.50, x: 0.175, z: 1.50 }, '3ph_flat': { r: 1.50, x: 0.25, z: 1.55 }, '3ph_spaced': { r: 1.50, x: 0.32, z: 1.55 } } },
    { size: 35,  values: { dc: 1.25, '1ph_m12': { r: 1.30, x: 0.31, z: 1.30 }, '1ph_m34': { r: 1.25, x: 0.195, z: 1.25 }, '1ph_m5': { r: 1.25, x: 0.28, z: 1.30 }, '3ph_m12': { r: 1.10, x: 0.27, z: 1.10 }, '3ph_trefoil': { r: 1.10, x: 0.170, z: 1.10 }, '3ph_flat': { r: 1.10, x: 0.24, z: 1.10 }, '3ph_spaced': { r: 1.10, x: 0.32, z: 1.15 } } },
    { size: 50,  values: { dc: 0.93, '1ph_m12': { r: 0.95, x: 0.30, z: 1.00 }, '1ph_m34': { r: 0.93, x: 0.190, z: 0.95 }, '1ph_m5': { r: 0.93, x: 0.28, z: 0.97 }, '3ph_m12': { r: 0.81, x: 0.26, z: 0.85 }, '3ph_trefoil': { r: 0.80, x: 0.165, z: 0.82 }, '3ph_flat': { r: 0.80, x: 0.24, z: 0.84 }, '3ph_spaced': { r: 0.80, x: 0.32, z: 0.86 } } },
    { size: 70,  values: { dc: 0.63, '1ph_m12': { r: 0.65, x: 0.29, z: 0.72 }, '1ph_m34': { r: 0.63, x: 0.185, z: 0.66 }, '1ph_m5': { r: 0.63, x: 0.27, z: 0.69 }, '3ph_m12': { r: 0.56, x: 0.25, z: 0.61 }, '3ph_trefoil': { r: 0.55, x: 0.160, z: 0.57 }, '3ph_flat': { r: 0.55, x: 0.24, z: 0.60 }, '3ph_spaced': { r: 0.55, x: 0.31, z: 0.63 } } },
    { size: 95,  values: { dc: 0.46, '1ph_m12': { r: 0.49, x: 0.28, z: 0.56 }, '1ph_m34': { r: 0.47, x: 0.180, z: 0.50 }, '1ph_m5': { r: 0.47, x: 0.27, z: 0.54 }, '3ph_m12': { r: 0.42, x: 0.24, z: 0.48 }, '3ph_trefoil': { r: 0.41, x: 0.155, z: 0.43 }, '3ph_flat': { r: 0.41, x: 0.23, z: 0.47 }, '3ph_spaced': { r: 0.40, x: 0.31, z: 0.51 } } },
    { size: 120, values: { dc: 0.36, '1ph_m12': { r: 0.39, x: 0.27, z: 0.47 }, '1ph_m34': { r: 0.37, x: 0.175, z: 0.41 }, '1ph_m5': { r: 0.37, x: 0.26, z: 0.45 }, '3ph_m12': { r: 0.33, x: 0.23, z: 0.41 }, '3ph_trefoil': { r: 0.32, x: 0.150, z: 0.36 }, '3ph_flat': { r: 0.32, x: 0.23, z: 0.40 }, '3ph_spaced': { r: 0.32, x: 0.30, z: 0.44 } } },
    { size: 150, values: { dc: 0.29, '1ph_m12': { r: 0.31, x: 0.27, z: 0.41 }, '1ph_m34': { r: 0.30, x: 0.175, z: 0.34 }, '1ph_m5': { r: 0.29, x: 0.26, z: 0.39 }, '3ph_m12': { r: 0.27, x: 0.23, z: 0.36 }, '3ph_trefoil': { r: 0.26, x: 0.150, z: 0.30 }, '3ph_flat': { r: 0.26, x: 0.23, z: 0.34 }, '3ph_spaced': { r: 0.26, x: 0.30, z: 0.40 } } },
    { size: 185, values: { dc: 0.23, '1ph_m12': { r: 0.25, x: 0.27, z: 0.37 }, '1ph_m34': { r: 0.24, x: 0.170, z: 0.29 }, '1ph_m5': { r: 0.24, x: 0.26, z: 0.35 }, '3ph_m12': { r: 0.22, x: 0.23, z: 0.32 }, '3ph_trefoil': { r: 0.21, x: 0.145, z: 0.26 }, '3ph_flat': { r: 0.21, x: 0.22, z: 0.31 }, '3ph_spaced': { r: 0.21, x: 0.30, z: 0.36 } } },
    { size: 240, values: { dc: 0.180, '1ph_m12': { r: 0.195, x: 0.26, z: 0.33 }, '1ph_m34': { r: 0.185, x: 0.165, z: 0.25 }, '1ph_m5': { r: 0.185, x: 0.25, z: 0.31 }, '3ph_m12': { r: 0.17, x: 0.23, z: 0.29 }, '3ph_trefoil': { r: 0.160, x: 0.145, z: 0.22 }, '3ph_flat': { r: 0.160, x: 0.22, z: 0.27 }, '3ph_spaced': { r: 0.160, x: 0.29, z: 0.34 } } },
    { size: 300, values: { dc: 0.145, '1ph_m12': { r: 0.160, x: 0.26, z: 0.31 }, '1ph_m34': { r: 0.150, x: 0.165, z: 0.22 }, '1ph_m5': { r: 0.150, x: 0.25, z: 0.29 }, '3ph_m12': { r: 0.14, x: 0.23, z: 0.27 }, '3ph_trefoil': { r: 0.130, x: 0.140, z: 0.190 }, '3ph_flat': { r: 0.130, x: 0.22, z: 0.25 }, '3ph_spaced': { r: 0.130, x: 0.29, z: 0.32 } } },
    { size: 400, values: { dc: 0.105, '1ph_m12': { r: 0.130, x: 0.26, z: 0.29 }, '1ph_m34': { r: 0.120, x: 0.160, z: 0.20 }, '1ph_m5': { r: 0.115, x: 0.25, z: 0.27 }, '3ph_m12': { r: 0.12, x: 0.22, z: 0.25 }, '3ph_trefoil': { r: 0.105, x: 0.140, z: 0.175 }, '3ph_flat': { r: 0.105, x: 0.21, z: 0.24 }, '3ph_spaced': { r: 0.100, x: 0.29, z: 0.31 } } },
    { size: 500, values: { dc: 0.086, '1ph_m12': { r: 0.110, x: 0.26, z: 0.28 }, '1ph_m34': { r: 0.098, x: 0.155, z: 0.185 }, '1ph_m5': { r: 0.093, x: 0.24, z: 0.26 }, '3ph_m12': { r: 0.10, x: 0.22, z: 0.25 }, '3ph_trefoil': { r: 0.086, x: 0.135, z: 0.160 }, '3ph_flat': { r: 0.086, x: 0.21, z: 0.23 }, '3ph_spaced': { r: 0.081, x: 0.29, z: 0.30 } } },
    { size: 630, values: { dc: 0.068, '1ph_m12': { r: 0.094, x: 0.25, z: 0.27 }, '1ph_m34': { r: 0.081, x: 0.155, z: 0.175 }, '1ph_m5': { r: 0.076, x: 0.24, z: 0.25 }, '3ph_m12': { r: 0.08, x: 0.22, z: 0.24 }, '3ph_trefoil': { r: 0.072, x: 0.135, z: 0.150 }, '3ph_flat': { r: 0.072, x: 0.21, z: 0.22 }, '3ph_spaced': { r: 0.066, x: 0.28, z: 0.29 } } },
    { size: 800, values: { dc: 0.053, '1ph_m12': null, '1ph_m34': { r: 0.068, x: 0.150, z: 0.165 }, '1ph_m5': { r: 0.061, x: 0.24, z: 0.25 }, '3ph_m12': null, '3ph_trefoil': { r: 0.060, x: 0.130, z: 0.145 }, '3ph_flat': { r: 0.060, x: 0.21, z: 0.22 }, '3ph_spaced': { r: 0.053, x: 0.28, z: 0.29 } } },
    { size: 1000, values: { dc: 0.042, '1ph_m12': null, '1ph_m34': { r: 0.059, x: 0.150, z: 0.160 }, '1ph_m5': { r: 0.050, x: 0.24, z: 0.24 }, '3ph_m12': null, '3ph_trefoil': { r: 0.052, x: 0.130, z: 0.140 }, '3ph_flat': { r: 0.052, x: 0.20, z: 0.21 }, '3ph_spaced': { r: 0.044, x: 0.28, z: 0.28 } } },
  ],
}

/** Table 6.3(b) — Multicore PVC insulated cables, unarmoured (flat twin & earth, surfix, etc.). */
const MULTICORE_PVC: VdCableType = {
  id: 'multi-pvc',
  label: 'Multicore PVC, unarmoured (twin & earth / surfix)',
  table: '6.3(b)',
  clauseRef: '6.2.7',
  arrangements: [
    { id: 'dc', label: 'd.c. — two-core cable', phases: 0 },
    { id: '1ph', label: 'Single-phase — two-core cable', phases: 1 },
    { id: '3ph', label: 'Three-phase — three/four-core cable', phases: 3 },
  ],
  rows: [
    { size: 1,   values: { dc: 44,  '1ph': 44, '3ph': 38 } },
    { size: 1.5, values: { dc: 29,  '1ph': 29, '3ph': 25 } },
    { size: 2.5, values: { dc: 18,  '1ph': 18, '3ph': 15 } },
    { size: 4,   values: { dc: 11,  '1ph': 11, '3ph': 9.5 } },
    { size: 6,   values: { dc: 7.3, '1ph': 7.3, '3ph': 6.4 } },
    { size: 10,  values: { dc: 4.4, '1ph': 4.4, '3ph': 3.8 } },
    { size: 16,  values: { dc: 2.8, '1ph': 2.8, '3ph': 2.4 } },
    { size: 25,  values: { dc: 1.75, '1ph': { r: 1.75, x: 0.170, z: 1.75 }, '3ph': { r: 1.50, x: 0.145, z: 1.50 } } },
    { size: 35,  values: { dc: 1.25, '1ph': { r: 1.25, x: 0.165, z: 1.25 }, '3ph': { r: 1.10, x: 0.145, z: 1.10 } } },
    { size: 50,  values: { dc: 0.93, '1ph': { r: 0.93, x: 0.165, z: 0.94 }, '3ph': { r: 0.80, x: 0.140, z: 0.81 } } },
    { size: 70,  values: { dc: 0.63, '1ph': { r: 0.63, x: 0.160, z: 0.65 }, '3ph': { r: 0.55, x: 0.140, z: 0.57 } } },
    { size: 95,  values: { dc: 0.46, '1ph': { r: 0.47, x: 0.155, z: 0.50 }, '3ph': { r: 0.41, x: 0.135, z: 0.43 } } },
    { size: 120, values: { dc: 0.36, '1ph': { r: 0.38, x: 0.155, z: 0.41 }, '3ph': { r: 0.33, x: 0.135, z: 0.35 } } },
    { size: 150, values: { dc: 0.29, '1ph': { r: 0.30, x: 0.155, z: 0.34 }, '3ph': { r: 0.26, x: 0.130, z: 0.29 } } },
    { size: 185, values: { dc: 0.23, '1ph': { r: 0.25, x: 0.150, z: 0.29 }, '3ph': { r: 0.21, x: 0.130, z: 0.25 } } },
    { size: 240, values: { dc: 0.180, '1ph': { r: 0.190, x: 0.150, z: 0.24 }, '3ph': { r: 0.165, x: 0.130, z: 0.21 } } },
    { size: 300, values: { dc: 0.145, '1ph': { r: 0.155, x: 0.145, z: 0.21 }, '3ph': { r: 0.135, x: 0.130, z: 0.185 } } },
    { size: 400, values: { dc: 0.105, '1ph': { r: 0.155, x: 0.145, z: 0.185 }, '3ph': { r: 0.100, x: 0.125, z: 0.160 } } },
  ],
}

/** Table 6.4(b) — Multicore PVC insulated armoured cables (SWA). */
const MULTICORE_SWA: VdCableType = {
  id: 'multi-swa',
  label: 'Multicore PVC, armoured (SWA)',
  table: '6.4(b)',
  clauseRef: '6.2.7',
  arrangements: [
    { id: 'dc', label: 'd.c. — two-core cable', phases: 0 },
    { id: '1ph', label: 'Single-phase — two-core cable', phases: 1 },
    { id: '3ph', label: 'Three-phase — three/four-core cable', phases: 3 },
  ],
  rows: [
    { size: 1.5, values: { dc: 29,  '1ph': 29, '3ph': 25 } },
    { size: 2.5, values: { dc: 18,  '1ph': 18, '3ph': 15 } },
    { size: 4,   values: { dc: 11,  '1ph': 11, '3ph': 9.5 } },
    { size: 6,   values: { dc: 7.3, '1ph': 7.3, '3ph': 6.4 } },
    { size: 10,  values: { dc: 4.4, '1ph': 4.4, '3ph': 3.8 } },
    { size: 16,  values: { dc: 2.8, '1ph': 2.8, '3ph': 2.4 } },
    { size: 25,  values: { dc: 1.75, '1ph': { r: 1.75, x: 0.170, z: 1.75 }, '3ph': { r: 1.50, x: 0.145, z: 1.50 } } },
    { size: 35,  values: { dc: 1.25, '1ph': { r: 1.25, x: 0.165, z: 1.25 }, '3ph': { r: 1.10, x: 0.145, z: 1.10 } } },
    { size: 50,  values: { dc: 0.93, '1ph': { r: 0.93, x: 0.165, z: 0.94 }, '3ph': { r: 0.80, x: 0.140, z: 0.81 } } },
    { size: 70,  values: { dc: 0.63, '1ph': { r: 0.63, x: 0.160, z: 0.65 }, '3ph': { r: 0.55, x: 0.140, z: 0.57 } } },
    { size: 95,  values: { dc: 0.46, '1ph': { r: 0.47, x: 0.155, z: 0.50 }, '3ph': { r: 0.41, x: 0.135, z: 0.43 } } },
    { size: 120, values: { dc: 0.36, '1ph': { r: 0.38, x: 0.155, z: 0.41 }, '3ph': { r: 0.33, x: 0.135, z: 0.35 } } },
    { size: 150, values: { dc: 0.29, '1ph': { r: 0.30, x: 0.155, z: 0.34 }, '3ph': { r: 0.26, x: 0.130, z: 0.29 } } },
    { size: 185, values: { dc: 0.23, '1ph': { r: 0.25, x: 0.150, z: 0.29 }, '3ph': { r: 0.21, x: 0.130, z: 0.25 } } },
    { size: 240, values: { dc: 0.180, '1ph': { r: 0.190, x: 0.150, z: 0.24 }, '3ph': { r: 0.165, x: 0.130, z: 0.21 } } },
    { size: 300, values: { dc: 0.145, '1ph': { r: 0.155, x: 0.145, z: 0.21 }, '3ph': { r: 0.135, x: 0.130, z: 0.185 } } },
    { size: 400, values: { dc: 0.105, '1ph': { r: 0.115, x: 0.145, z: 0.185 }, '3ph': { r: 0.100, x: 0.125, z: 0.160 } } },
  ],
}

export const VD_CABLE_TYPES: VdCableType[] = [SINGLE_CORE_PVC, MULTICORE_PVC, MULTICORE_SWA, ...VD_CABLE_TYPES_EXTRA]
