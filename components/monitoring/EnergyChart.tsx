'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Reading {
  recorded_at: string
  pv_power_w: number | null
  battery_power_w: number | null
  grid_power_w: number | null
  load_power_w: number | null
}

interface ChartPoint {
  time: string
  solar: number
  battery: number
  grid: number
  load: number
}

function formatTime(iso: string, hours: number) {
  const d = new Date(iso)
  if (hours <= 24) {
    return d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

function kw(w: number | null) { return Math.round((w ?? 0) / 100) / 10 }

interface Props {
  systemId: string
  hours?: number
}

const RANGES: { label: string; hours: number }[] = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]

export function EnergyChart({ systemId, hours: initialHours = 24 }: Props) {
  const [hours, setHours] = useState(initialHours)
  const [data, setData] = useState<ChartPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/monitoring/readings?systemId=${systemId}&hours=${hours}`)
      .then((r) => r.json())
      .then((readings: Reading[]) => {
        setData(
          readings.map((r) => ({
            time: formatTime(r.recorded_at, hours),
            solar:   kw(r.pv_power_w),
            battery: kw(r.battery_power_w),
            grid:    kw(r.grid_power_w),
            load:    kw(r.load_power_w),
          }))
        )
      })
      .finally(() => setLoading(false))
  }, [systemId, hours])

  const selector = (
    <div className="mb-3 flex gap-1">
      {RANGES.map((r) => (
        <button
          key={r.label}
          onClick={() => setHours(r.hours)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            hours === r.hours ? 'bg-foreground text-background' : 'border border-border hover:bg-muted'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )

  if (loading) {
    return <>{selector}<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Loading chart…</div></>
  }

  if (!data.length) {
    return (
      <>
        {selector}
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          No readings in this window — import history below to fill it in.
        </div>
      </>
    )
  }

  return (
    <>
    {selector}
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="solar"   x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#eab308" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#eab308" stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="load"    x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#a855f7" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} unit=" kW" />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
          formatter={(val) => [`${String(val)} kW`]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="solar"   name="Solar"   stroke="#eab308" fill="url(#solar)"   strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="load"    name="Load"    stroke="#a855f7" fill="url(#load)"    strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="battery" name="Battery" stroke="#22c55e" fill="none"          strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Area type="monotone" dataKey="grid"    name="Grid"    stroke="#3b82f6" fill="none"          strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
    </>
  )
}
