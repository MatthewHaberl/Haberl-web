'use client'

import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  calculateAllStringsGeneration,
  calculateMonthlyBreakdown,
} from '@/lib/solar/generation-calculator'
import type { Season } from '@/lib/solar/generation-calculator'

interface SegmentInput {
  panelCount: number
  azimuth: number
  pitch: number
  label: string
}

interface Props {
  segments: SegmentInput[]
  panelWatts: number
}

function segmentColor(azimuth: number): string {
  if (azimuth >= 340 || azimuth < 20) return '#22c55e'  // North — green
  if (azimuth >= 70 && azimuth < 110) return '#f59e0b'  // East — amber
  if (azimuth >= 250 && azimuth < 340) return '#8b5cf6' // West — violet
  return '#ef4444'                                        // South — red
}

export function GenerationChart({ segments, panelWatts }: Props) {
  const [season, setSeason] = useState<Season>('average')
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const generationData = calculateAllStringsGeneration(segments, panelWatts, season)
  const monthly = calculateMonthlyBreakdown(segments, panelWatts)

  // Build chart data — one point per hour, one key per segment
  const chartData = (generationData.get(0)?.hourly ?? []).map((h, i) => {
    const point: Record<string, string | number> = { time: h.timeLabel }
    segments.forEach((seg, idx) => {
      point[seg.label] = generationData.get(idx)?.hourly[i]?.generation_kw ?? 0
    })
    return point
  })

  const seasonLabels: Record<Season, string> = { summer: '☀ Summer', average: '◑ Average', winter: '❄ Winter' }

  return (
    <div className="flex flex-col gap-4">

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          <button onClick={() => setView('chart')} className={`px-3 py-1.5 font-medium transition-colors ${view === 'chart' ? 'bg-accent text-accent-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>Timeline</button>
          <button onClick={() => setView('table')} className={`px-3 py-1.5 font-medium transition-colors border-l border-border ${view === 'table' ? 'bg-accent text-accent-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>Monthly table</button>
        </div>
        <div className="flex rounded-md border border-border overflow-hidden text-xs ml-auto">
          {(['summer', 'average', 'winter'] as Season[]).map(s => (
            <button key={s} onClick={() => setSeason(s)} className={`px-3 py-1.5 font-medium transition-colors ${s !== 'summer' ? 'border-l border-border' : ''} ${season === s ? 'bg-accent text-accent-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>{seasonLabels[s]}</button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'kW', angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 11 } }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} kW`]} labelFormatter={(l) => `${l}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {segments.map(seg => (
                <Line key={seg.label} type="monotone" dataKey={seg.label} stroke={segmentColor(seg.azimuth)}
                  dot={false} strokeWidth={2} isAnimationActive={false}
                  name={`${seg.label} (${seg.panelCount}p)`} />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Per-segment daily summary cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {segments.map((seg, idx) => {
              const d = generationData.get(idx)
              if (!d) return null
              return (
                <div key={idx} className="p-2.5 rounded-lg border border-border bg-muted/40 text-xs flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: segmentColor(seg.azimuth) }} />
                    {seg.label} · {seg.panelCount}p
                  </div>
                  <div className="text-muted-foreground">Peak <span className="font-medium text-foreground">{d.peak_kw} kW</span> @ {d.peak_time}</div>
                  <div className="text-muted-foreground">Daily est. <span className="font-medium text-foreground">{d.daily_kwh} kWh</span></div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        /* Monthly table */
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Month</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Daylight h</th>
                {monthly.segments.map(seg => (
                  <th key={seg.label} className="text-right px-3 py-2 font-medium" style={{ color: segmentColor(seg.azimuth) }}>
                    {seg.label} kWh
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-medium text-foreground">Total kWh</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {monthly.totals.map((row, i) => (
                <tr key={row.month} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="px-3 py-1.5 font-medium">{row.month}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{row.daylightHours.toFixed(1)}</td>
                  {monthly.segments.map(seg => (
                    <td key={seg.label} className="px-3 py-1.5 text-right">{seg.monthly[i].generationKwh.toLocaleString()}</td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-semibold">{row.generationKwh.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{row.cumulativeKwh.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/50 font-semibold">
                <td className="px-3 py-2">Annual</td>
                <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                {monthly.segments.map(seg => (
                  <td key={seg.label} className="px-3 py-2 text-right">{seg.annualKwh.toLocaleString()}</td>
                ))}
                <td className="px-3 py-2 text-right text-accent">{monthly.annualTotal.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
