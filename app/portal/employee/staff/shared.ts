import type { Staff } from '@/types/database'

/** A staff record with the current week's hours costed onto it. */
export interface StaffRow extends Staff {
  weekHours: number
  weekPayR: number
  /** ISO timestamp their running clock started, or null if they're off. */
  onClockSince: string | null
}

export const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "2 h 15 m" from a start timestamp to now — the clock widget's readout. */
export function elapsed(since: string, now: number = Date.now()): string {
  const ms = now - new Date(since).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '0 m'
  const mins = Math.floor(ms / 60_000)
  const h = Math.floor(mins / 60)
  return h > 0 ? `${h} h ${mins % 60} m` : `${mins} m`
}
