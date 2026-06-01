'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface SavingsAccumulationProps {
  annualSavingR: number
  tariffEscalationPctPerYear?: number
  years?: number
}

export function SavingsAccumulation({
  annualSavingR,
  tariffEscalationPctPerYear = 12,
  years = 20
}: SavingsAccumulationProps) {
  // Calculate year-by-year savings with escalation
  const data = Array.from({ length: years }, (_, i) => {
    const year = i + 1
    let flatCumulative = 0
    let escalatedCumulative = 0

    for (let y = 1; y <= year; y++) {
      // Flat tariff scenario
      flatCumulative += annualSavingR

      // Escalated tariff scenario (12% annual increase)
      const escalatedAnnual = annualSavingR * Math.pow(1 + tariffEscalationPctPerYear / 100, y - 1)
      escalatedCumulative += escalatedAnnual
    }

    return {
      year,
      flat: Math.round(flatCumulative),
      escalated: Math.round(escalatedCumulative)
    }
  })

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload) return null
    return (
      <div className="bg-white p-3 rounded shadow-lg border border-gray-200">
        <p className="font-semibold text-sm">Year {payload[0]?.payload?.year}</p>
        {payload.map((entry: any, idx: number) => (
          <p key={idx} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="year"
            label={{ value: 'Year', position: 'insideBottomRight', offset: -5 }}
          />
          <YAxis
            label={{ value: 'Cumulative Savings (R)', angle: -90, position: 'insideLeft' }}
            tickFormatter={(value) => `R${(value / 1000000).toFixed(1)}M`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="flat"
            stroke="#8884d8"
            name="Flat tariff"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="escalated"
            stroke="#f97316"
            name="12% p.a. escalation"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Key insights */}
      <div className="grid grid-cols-3 gap-4 pt-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-sm font-medium text-blue-900">Year 10 (Flat)</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {formatCurrency(data[9]?.flat || 0)}
          </div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <div className="text-sm font-medium text-orange-900">Year 10 (Escalated)</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">
            {formatCurrency(data[9]?.escalated || 0)}
          </div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-sm font-medium text-green-900">Year 20 (Escalated)</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(data[19]?.escalated || 0)}
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
        <p><strong>Assumptions:</strong> Annual savings based on current tariff of R2.75/kWh. Escalation model assumes consistent 12% p.a. increase (historical SA trend). Actual savings depend on usage patterns and tariff changes.</p>
      </div>
    </div>
  )
}
