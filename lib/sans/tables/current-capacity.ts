/**
 * SANS 10142-1:2024 Ed 3.2 current-carrying capacity tables (amperes).
 *
 * Transcribed from tables 6.2(a), 6.3(a), 6.4(a), 6.6(a) — ambient 30 °C,
 * conductor operating temperature 70 °C. Aluminium/buried/rubber batch
 * (6.5(a), 6.7(a), 6.8, 6.9(a)) is generated — see current-capacity-extra.ts.
 * null = not applicable (—) in the source.
 */
import { CC_CABLE_TYPES_EXTRA } from './current-capacity-extra'

export interface CcArrangement {
  id: string
  label: string
  phases: 1 | 3
}

export interface CcRow {
  size: number
  values: Record<string, number | null>
}

export interface CcCableType {
  id: string
  label: string
  table: string
  rows: CcRow[]
  arrangements: CcArrangement[]
  /** Insulation class for table 6.10 ambient correction; defaults to PVC 70 °C. */
  insulation?: 'pvc70' | 'rubber85'
  /** Buried tables use soil factors (6.11/6.12), not the air ambient/grouping factors. */
  buried?: boolean
}

/** Table 6.2(a) — Single-core PVC insulated cables, unarmoured. */
const SINGLE_CORE_PVC: CcCableType = {
  id: 'single-pvc',
  label: 'Single-core PVC, unarmoured (SANS 1507)',
  table: '6.2(a)',
  arrangements: [
    { id: 'm1_1ph', label: 'Method 1 (conduit in insulated wall) — 2 cables, 1φ/d.c.', phases: 1 },
    { id: 'm1_3ph', label: 'Method 1 (conduit in insulated wall) — 3–4 cables, 3φ', phases: 3 },
    { id: 'm2_1ph', label: 'Method 2 (conduit on wall / trunking) — 2 cables, 1φ/d.c.', phases: 1 },
    { id: 'm2_3ph', label: 'Method 2 (conduit on wall / trunking) — 3–4 cables, 3φ', phases: 3 },
    { id: 'm3_1ph', label: 'Method 3 (clipped direct) — 2 cables, 1φ/d.c., flat touching', phases: 1 },
    { id: 'm3_3ph', label: 'Method 3 (clipped direct) — 3–4 cables, 3φ, flat touching/trefoil', phases: 3 },
    { id: 'm4_1ph', label: 'Method 4 (perforated tray) — 2 cables, 1φ/d.c., flat touching', phases: 1 },
    { id: 'm4_3ph', label: 'Method 4 (perforated tray) — 3–4 cables, 3φ, flat touching/trefoil', phases: 3 },
    { id: 'm5_hz', label: 'Method 5 (free air) — horizontal flat spaced', phases: 1 },
    { id: 'm5_vt', label: 'Method 5 (free air) — vertical flat spaced', phases: 1 },
    { id: 'm5_trefoil', label: 'Method 5 (free air) — trefoil, 3φ', phases: 3 },
  ],
  rows: [
    { size: 1,    values: { m1_1ph: 11,   m1_3ph: 10.5, m2_1ph: 13.5, m2_3ph: 12,  m3_1ph: 15.5, m3_3ph: 14,  m4_1ph: null, m4_3ph: null, m5_hz: null, m5_vt: null, m5_trefoil: null } },
    { size: 1.5,  values: { m1_1ph: 14.5, m1_3ph: 13.5, m2_1ph: 17.5, m2_3ph: 15.5, m3_1ph: 20,  m3_3ph: 18,  m4_1ph: null, m4_3ph: null, m5_hz: null, m5_vt: null, m5_trefoil: null } },
    { size: 2.5,  values: { m1_1ph: 19.5, m1_3ph: 18,   m2_1ph: 24,  m2_3ph: 21,  m3_1ph: 27,  m3_3ph: 25,  m4_1ph: null, m4_3ph: null, m5_hz: null, m5_vt: null, m5_trefoil: null } },
    { size: 4,    values: { m1_1ph: 26,   m1_3ph: 24,   m2_1ph: 32,  m2_3ph: 28,  m3_1ph: 37,  m3_3ph: 33,  m4_1ph: null, m4_3ph: null, m5_hz: null, m5_vt: null, m5_trefoil: null } },
    { size: 6,    values: { m1_1ph: 34,   m1_3ph: 31,   m2_1ph: 41,  m2_3ph: 36,  m3_1ph: 47,  m3_3ph: 43,  m4_1ph: null, m4_3ph: null, m5_hz: null, m5_vt: null, m5_trefoil: null } },
    { size: 10,   values: { m1_1ph: 46,   m1_3ph: 42,   m2_1ph: 57,  m2_3ph: 50,  m3_1ph: 65,  m3_3ph: 59,  m4_1ph: null, m4_3ph: null, m5_hz: null, m5_vt: null, m5_trefoil: null } },
    { size: 16,   values: { m1_1ph: 61,   m1_3ph: 56,   m2_1ph: 76,  m2_3ph: 68,  m3_1ph: 87,  m3_3ph: 79,  m4_1ph: null, m4_3ph: null, m5_hz: null, m5_vt: null, m5_trefoil: null } },
    { size: 25,   values: { m1_1ph: 80,   m1_3ph: 73,   m2_1ph: 101, m2_3ph: 89,  m3_1ph: 114, m3_3ph: 104, m4_1ph: 126,  m4_3ph: 112,  m5_hz: 146,  m5_vt: 130,  m5_trefoil: 110 } },
    { size: 35,   values: { m1_1ph: 99,   m1_3ph: 89,   m2_1ph: 125, m2_3ph: 110, m3_1ph: 141, m3_3ph: 129, m4_1ph: 156,  m4_3ph: 141,  m5_hz: 181,  m5_vt: 162,  m5_trefoil: 137 } },
    { size: 50,   values: { m1_1ph: 119,  m1_3ph: 108,  m2_1ph: 151, m2_3ph: 134, m3_1ph: 182, m3_3ph: 167, m4_1ph: 191,  m4_3ph: 172,  m5_hz: 219,  m5_vt: 197,  m5_trefoil: 167 } },
    { size: 70,   values: { m1_1ph: 151,  m1_3ph: 136,  m2_1ph: 192, m2_3ph: 171, m3_1ph: 234, m3_3ph: 214, m4_1ph: 246,  m4_3ph: 223,  m5_hz: 281,  m5_vt: 254,  m5_trefoil: 216 } },
    { size: 95,   values: { m1_1ph: 182,  m1_3ph: 164,  m2_1ph: 232, m2_3ph: 207, m3_1ph: 284, m3_3ph: 261, m4_1ph: 300,  m4_3ph: 273,  m5_hz: 341,  m5_vt: 311,  m5_trefoil: 264 } },
    { size: 120,  values: { m1_1ph: 210,  m1_3ph: 188,  m2_1ph: 269, m2_3ph: 239, m3_1ph: 330, m3_3ph: 303, m4_1ph: 349,  m4_3ph: 318,  m5_hz: 396,  m5_vt: 362,  m5_trefoil: 308 } },
    { size: 150,  values: { m1_1ph: 240,  m1_3ph: 216,  m2_1ph: 300, m2_3ph: 262, m3_1ph: 381, m3_3ph: 349, m4_1ph: 404,  m4_3ph: 369,  m5_hz: 456,  m5_vt: 419,  m5_trefoil: 356 } },
    { size: 185,  values: { m1_1ph: 273,  m1_3ph: 245,  m2_1ph: 341, m2_3ph: 296, m3_1ph: 436, m3_3ph: 400, m4_1ph: 463,  m4_3ph: 424,  m5_hz: 521,  m5_vt: 480,  m5_trefoil: 409 } },
    { size: 240,  values: { m1_1ph: 320,  m1_3ph: 286,  m2_1ph: 400, m2_3ph: 346, m3_1ph: 515, m3_3ph: 472, m4_1ph: 549,  m4_3ph: 504,  m5_hz: 615,  m5_vt: 569,  m5_trefoil: 485 } },
    { size: 300,  values: { m1_1ph: 367,  m1_3ph: 328,  m2_1ph: 458, m2_3ph: 394, m3_1ph: 594, m3_3ph: 545, m4_1ph: 635,  m4_3ph: 584,  m5_hz: 709,  m5_vt: 659,  m5_trefoil: 561 } },
    { size: 400,  values: { m1_1ph: null, m1_3ph: null, m2_1ph: 546, m2_3ph: 467, m3_1ph: 694, m3_3ph: 634, m4_1ph: 732,  m4_3ph: 679,  m5_hz: 852,  m5_vt: 795,  m5_trefoil: 656 } },
    { size: 500,  values: { m1_1ph: null, m1_3ph: null, m2_1ph: 626, m2_3ph: 533, m3_1ph: 792, m3_3ph: 723, m4_1ph: 835,  m4_3ph: 778,  m5_hz: 982,  m5_vt: 920,  m5_trefoil: 749 } },
    { size: 630,  values: { m1_1ph: null, m1_3ph: null, m2_1ph: 720, m2_3ph: 611, m3_1ph: 904, m3_3ph: 826, m4_1ph: 953,  m4_3ph: 892,  m5_hz: 1138, m5_vt: 1070, m5_trefoil: 855 } },
    { size: 800,  values: { m1_1ph: null, m1_3ph: null, m2_1ph: null, m2_3ph: null, m3_1ph: 1030, m3_3ph: 943, m4_1ph: 1086, m4_3ph: 1020, m5_hz: 1265, m5_vt: 1188, m5_trefoil: 971 } },
    { size: 1000, values: { m1_1ph: null, m1_3ph: null, m2_1ph: null, m2_3ph: null, m3_1ph: 1154, m3_3ph: 1058, m4_1ph: 1216, m4_3ph: 1149, m5_hz: 1420, m5_vt: 1337, m5_trefoil: 1079 } },
  ],
}

/** Table 6.3(a) — Multicore PVC insulated cables, unarmoured. */
const MULTICORE_PVC: CcCableType = {
  id: 'multi-pvc',
  label: 'Multicore PVC, unarmoured (twin & earth / surfix)',
  table: '6.3(a)',
  arrangements: [
    { id: 'm1_2c', label: 'Method 1 (in insulating wall) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm1_34c', label: 'Method 1 (in insulating wall) — three/four-core, 3φ', phases: 3 },
    { id: 'm2_2c', label: 'Method 2 (conduit/trunking on wall) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm2_34c', label: 'Method 2 (conduit/trunking on wall) — three/four-core, 3φ', phases: 3 },
    { id: 'm3_2c', label: 'Method 3 (clipped direct) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm3_34c', label: 'Method 3 (clipped direct) — three/four-core, 3φ', phases: 3 },
    { id: 'm46_2c', label: 'Method 4 (tray) / 6 (free air) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm46_34c', label: 'Method 4 (tray) / 6 (free air) — three/four-core, 3φ', phases: 3 },
  ],
  rows: [
    { size: 1,   values: { m1_2c: 11,   m1_34c: 10,  m2_2c: 13,  m2_34c: 11.5, m3_2c: 15,  m3_34c: 13.5, m46_2c: 17,  m46_34c: 14.5 } },
    { size: 1.5, values: { m1_2c: 14,   m1_34c: 13,  m2_2c: 16.5, m2_34c: 15,  m3_2c: 19.5, m3_34c: 17.5, m46_2c: 22,  m46_34c: 18.5 } },
    { size: 2.5, values: { m1_2c: 18.5, m1_34c: 17.5, m2_2c: 23, m2_34c: 20,  m3_2c: 27,  m3_34c: 24,  m46_2c: 30,  m46_34c: 25 } },
    { size: 4,   values: { m1_2c: 25,   m1_34c: 23,  m2_2c: 30,  m2_34c: 27,  m3_2c: 36,  m3_34c: 32,  m46_2c: 40,  m46_34c: 34 } },
    { size: 6,   values: { m1_2c: 32,   m1_34c: 29,  m2_2c: 38,  m2_34c: 34,  m3_2c: 46,  m3_34c: 41,  m46_2c: 51,  m46_34c: 43 } },
    { size: 10,  values: { m1_2c: 43,   m1_34c: 39,  m2_2c: 52,  m2_34c: 46,  m3_2c: 63,  m3_34c: 57,  m46_2c: 70,  m46_34c: 60 } },
    { size: 16,  values: { m1_2c: 57,   m1_34c: 52,  m2_2c: 69,  m2_34c: 62,  m3_2c: 85,  m3_34c: 76,  m46_2c: 94,  m46_34c: 80 } },
    { size: 25,  values: { m1_2c: 75,   m1_34c: 68,  m2_2c: 90,  m2_34c: 80,  m3_2c: 112, m3_34c: 96,  m46_2c: 119, m46_34c: 101 } },
    { size: 35,  values: { m1_2c: 92,   m1_34c: 83,  m2_2c: 111, m2_34c: 99,  m3_2c: 138, m3_34c: 119, m46_2c: 148, m46_34c: 126 } },
    { size: 50,  values: { m1_2c: 110,  m1_34c: 99,  m2_2c: 133, m2_34c: 118, m3_2c: 168, m3_34c: 144, m46_2c: 180, m46_34c: 153 } },
    { size: 70,  values: { m1_2c: 139,  m1_34c: 125, m2_2c: 168, m2_34c: 149, m3_2c: 213, m3_34c: 184, m46_2c: 232, m46_34c: 196 } },
    { size: 95,  values: { m1_2c: 167,  m1_34c: 150, m2_2c: 201, m2_34c: 179, m3_2c: 258, m3_34c: 223, m46_2c: 282, m46_34c: 238 } },
    { size: 120, values: { m1_2c: 192,  m1_34c: 172, m2_2c: 232, m2_34c: 206, m3_2c: 299, m3_34c: 259, m46_2c: 328, m46_34c: 276 } },
    { size: 150, values: { m1_2c: 219,  m1_34c: 196, m2_2c: 258, m2_34c: 225, m3_2c: 344, m3_34c: 299, m46_2c: 379, m46_34c: 319 } },
    { size: 185, values: { m1_2c: 248,  m1_34c: 223, m2_2c: 294, m2_34c: 255, m3_2c: 392, m3_34c: 341, m46_2c: 434, m46_34c: 364 } },
    { size: 240, values: { m1_2c: 291,  m1_34c: 261, m2_2c: 344, m2_34c: 297, m3_2c: 461, m3_34c: 403, m46_2c: 514, m46_34c: 430 } },
    { size: 300, values: { m1_2c: 334,  m1_34c: 298, m2_2c: 394, m2_34c: 339, m3_2c: 530, m3_34c: 464, m46_2c: 593, m46_34c: 497 } },
    { size: 400, values: { m1_2c: null, m1_34c: null, m2_2c: 470, m2_34c: 402, m3_2c: 634, m3_34c: 557, m46_2c: 715, m46_34c: 597 } },
  ],
}

/** Table 6.4(a) — Multicore PVC insulated armoured cables (SWA). */
const MULTICORE_SWA: CcCableType = {
  id: 'multi-swa',
  label: 'Multicore PVC, armoured (SWA)',
  table: '6.4(a)',
  arrangements: [
    { id: 'm3_2c', label: 'Method 3 (clipped direct) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm3_34c', label: 'Method 3 (clipped direct) — three/four-core, 3φ', phases: 3 },
    { id: 'm46_2c', label: 'Method 4 (tray) / 6 (free air) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm46_34c', label: 'Method 4 (tray) / 6 (free air) — three/four-core, 3φ', phases: 3 },
  ],
  rows: [
    { size: 1.5, values: { m3_2c: 21,  m3_34c: 18,  m46_2c: 22,  m46_34c: 19 } },
    { size: 2.5, values: { m3_2c: 28,  m3_34c: 25,  m46_2c: 31,  m46_34c: 26 } },
    { size: 4,   values: { m3_2c: 38,  m3_34c: 33,  m46_2c: 41,  m46_34c: 35 } },
    { size: 6,   values: { m3_2c: 49,  m3_34c: 42,  m46_2c: 53,  m46_34c: 45 } },
    { size: 10,  values: { m3_2c: 67,  m3_34c: 58,  m46_2c: 72,  m46_34c: 62 } },
    { size: 16,  values: { m3_2c: 89,  m3_34c: 77,  m46_2c: 97,  m46_34c: 83 } },
    { size: 25,  values: { m3_2c: 118, m3_34c: 102, m46_2c: 128, m46_34c: 110 } },
    { size: 35,  values: { m3_2c: 145, m3_34c: 125, m46_2c: 157, m46_34c: 135 } },
    { size: 50,  values: { m3_2c: 175, m3_34c: 151, m46_2c: 190, m46_34c: 163 } },
    { size: 70,  values: { m3_2c: 222, m3_34c: 192, m46_2c: 241, m46_34c: 207 } },
    { size: 95,  values: { m3_2c: 269, m3_34c: 231, m46_2c: 291, m46_34c: 251 } },
    { size: 120, values: { m3_2c: 310, m3_34c: 267, m46_2c: 336, m46_34c: 290 } },
    { size: 150, values: { m3_2c: 356, m3_34c: 306, m46_2c: 386, m46_34c: 332 } },
    { size: 185, values: { m3_2c: 405, m3_34c: 348, m46_2c: 439, m46_34c: 378 } },
    { size: 240, values: { m3_2c: 476, m3_34c: 409, m46_2c: 516, m46_34c: 445 } },
    { size: 300, values: { m3_2c: 547, m3_34c: 469, m46_2c: 592, m46_34c: 510 } },
    { size: 400, values: { m3_2c: 621, m3_34c: 540, m46_2c: 683, m46_34c: 590 } },
  ],
}

/** Table 6.6(a) — Multicore PVC insulated cables, unarmoured, aluminium conductors. */
const MULTICORE_AL: CcCableType = {
  id: 'multi-al',
  label: 'Multicore PVC, unarmoured, aluminium',
  table: '6.6(a)',
  arrangements: [
    { id: 'm1_2c', label: 'Method 1 (in insulating wall) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm1_34c', label: 'Method 1 (in insulating wall) — three/four-core, 3φ', phases: 3 },
    { id: 'm2_2c', label: 'Method 2 (conduit/trunking on wall) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm2_34c', label: 'Method 2 (conduit/trunking on wall) — three/four-core, 3φ', phases: 3 },
    { id: 'm3_2c', label: 'Method 3 (clipped direct) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm3_34c', label: 'Method 3 (clipped direct) — three/four-core, 3φ', phases: 3 },
    { id: 'm46_2c', label: 'Method 4 (tray) / 6 (free air) — two-core, 1φ/d.c.', phases: 1 },
    { id: 'm46_34c', label: 'Method 4 (tray) / 6 (free air) — three/four-core, 3φ', phases: 3 },
  ],
  rows: [
    { size: 16,  values: { m1_2c: 44,  m1_34c: 41,  m2_2c: 54,  m2_34c: 48,  m3_2c: 66,  m3_34c: 59,  m46_2c: 73,  m46_34c: 61 } },
    { size: 25,  values: { m1_2c: 58,  m1_34c: 53,  m2_2c: 71,  m2_34c: 62,  m3_2c: 83,  m3_34c: 73,  m46_2c: 89,  m46_34c: 78 } },
    { size: 35,  values: { m1_2c: 71,  m1_34c: 65,  m2_2c: 86,  m2_34c: 77,  m3_2c: 103, m3_34c: 90,  m46_2c: 111, m46_34c: 96 } },
    { size: 50,  values: { m1_2c: 86,  m1_34c: 78,  m2_2c: 104, m2_34c: 92,  m3_2c: 125, m3_34c: 110, m46_2c: 135, m46_34c: 117 } },
    { size: 70,  values: { m1_2c: 108, m1_34c: 98,  m2_2c: 131, m2_34c: 116, m3_2c: 160, m3_34c: 140, m46_2c: 173, m46_34c: 150 } },
    { size: 95,  values: { m1_2c: 130, m1_34c: 118, m2_2c: 157, m2_34c: 139, m3_2c: 195, m3_34c: 170, m46_2c: 210, m46_34c: 183 } },
    { size: 120, values: { m1_2c: null, m1_34c: 135, m2_2c: null, m2_34c: 160, m3_2c: null, m3_34c: 197, m46_2c: null, m46_34c: 212 } },
    { size: 150, values: { m1_2c: null, m1_34c: 155, m2_2c: null, m2_34c: 184, m3_2c: null, m3_34c: 227, m46_2c: null, m46_34c: 245 } },
    { size: 185, values: { m1_2c: null, m1_34c: 176, m2_2c: null, m2_34c: 210, m3_2c: null, m3_34c: 259, m46_2c: null, m46_34c: 280 } },
    { size: 240, values: { m1_2c: null, m1_34c: 207, m2_2c: null, m2_34c: 248, m3_2c: null, m3_34c: 305, m46_2c: null, m46_34c: 330 } },
    { size: 300, values: { m1_2c: null, m1_34c: 237, m2_2c: null, m2_34c: 285, m3_2c: null, m3_34c: 351, m46_2c: null, m46_34c: 381 } },
  ],
}

export const CC_CABLE_TYPES: CcCableType[] = [
  SINGLE_CORE_PVC,
  MULTICORE_PVC,
  MULTICORE_SWA,
  MULTICORE_AL,
  ...CC_CABLE_TYPES_EXTRA.map((t) =>
    t.id === 'rubber-flex' ? { ...t, insulation: 'rubber85' as const } : t.id === 'buried-swa' ? { ...t, buried: true } : t,
  ),
]
