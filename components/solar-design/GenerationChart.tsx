'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import type { StringGenerationSummary, Season } from '@/lib/solar/generation-calculator'
import { calculateAllStringsGeneration } from '@/lib/solar/generation-calculator'

interface Props {
  strings: Array<{ panelCount: number; azimuth: number; pitch: number }>
  panelWatts: number
}

function getStringLabel(azimuth: number): string {
  if (azimuth >= 340 || azimuth < 20) return 'North'
  if (azimuth >= 70 && azimuth < 110) return 'East'
  if (azimuth >= 160 && azimuth < 200) return 'South'
  if (azimuth >= 250 && azimuth < 290) return 'West'
  return `${Math.round(azimuth)}°`
}

function getStringColor(azimuth: number): string {
  if (azimuth >= 340 || azimuth < 20) return '#3b82f6' // Blue - North
  if (azimuth >= 70 && azimuth < 110) return '#f97316' // Orange - East
  if (azimuth >= 160 && azimuth < 200) return '#ef4444' // Red - South
  if (azimuth >= 250 && azimuth < 290) return '#a855f7' // Purple - West
  return '#8b5cf6' // Default purple
}

export function GenerationChart({ strings, panelWatts }: Props) {
  const [season, setSeason] = useState<Season>('average')

  const generationData = calculateAllStringsGeneration(strings, panelWatts, season)

  // Merge hourly data from all strings into a single array
  const chartData = generationData.get(0)?.hourly.map((hour, idx) => {
    const point: any = {
      time: hour.timeLabel,
    }

    generationData.forEach((data, stringIdx) => {
      const stringLabel = getStringLabel(strings[stringIdx].azimuth)
      point[`string_${stringIdx}`] = data.hourly[idx]?.generation_kw ?? 0
      point[`${stringLabel}`] = data.hourly[idx]?.generation_kw ?? 0
    })

    return point
  }) ?? []

  return (
    <div className="flex flex-col gap-4 p-4 border border-border rounded-lg bg-background">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Generation Timeline</h3>

        {/* Season toggle */}
        <div className="flex gap-1">
          {(['summer', 'average', 'winter'] as const).map((s) => (
            <Button
              key={s}
              variant={season === s ? 'accent' : 'outline'}
              size="sm"
              className="text-xs"
              onClick={() => setSeason(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              label={{ value: 'Time of Day', position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis
              label={{ value: 'Power (kW)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              formatter={(value) => `${Number(value).toFixed(2)} kW`}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend />

            {strings.map((string, idx) => (
              <Line
                key={idx}
                type="monotone"
                dataKey={getStringLabel(string.azimuth)}
                stroke={getStringColor(string.azimuth)}
                dot={false}
                strokeWidth={2}
                name={`${getStringLabel(string.azimuth)} (${string.panelCount} panels)`}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
          No data available
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
        {strings.map((string, idx) => {
          const data = generationData.get(idx)
          if (!data) return null
          return (
            <div key={idx} className="flex flex-col gap-1 p-2 bg-muted/50 rounded text-xs">
              <div className="font-medium">{getStringLabel(string.azimuth)} ({string.panelCount} panels)</div>
              <div>Peak: <span className="font-semibold">{data.peak_kw} kW</span> @ {data.peak_time}</div>
              <div>Daily: <span className="font-semibold">{data.daily_kwh} kWh</span></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
