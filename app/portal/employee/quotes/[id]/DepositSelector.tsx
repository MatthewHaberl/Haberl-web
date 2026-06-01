'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'

function formatR(rands: number): string {
  return 'R' + rands.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export interface DepositLineItem {
  name: string
  amountRands: number
}

interface Props {
  items: DepositLineItem[]
  selected: string[]
  quoteTotalRands: number
  onChange: (selected: string[]) => void
}

export function DepositSelector({ items, selected, quoteTotalRands, onChange }: Props) {
  const [open, setOpen] = useState(true)

  const { depositTotal, balance } = useMemo(() => {
    const depositTotal = items
      .filter((i) => selected.includes(i.name))
      .reduce((sum, i) => sum + i.amountRands, 0)
    return { depositTotal, balance: quoteTotalRands - depositTotal }
  }, [items, selected, quoteTotalRands])

  function toggle(name: string) {
    onChange(
      selected.includes(name)
        ? selected.filter((n) => n !== name)
        : [...selected, name]
    )
  }

  function selectDefaults() {
    const defaults = items
      .filter((i) => ['Solar Panels', 'Inverter', 'Battery', 'Mounting'].some((kw) => i.name.includes(kw)))
      .map((i) => i.name)
    onChange(defaults)
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted hover:bg-muted/80 transition-colors text-sm font-semibold text-primary"
      >
        <span>Deposit Items</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="p-4 flex flex-col gap-4">
          {/* Item list */}
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <label
                key={item.name}
                className="flex items-center gap-3 py-2 px-3 rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(item.name)}
                  onChange={() => toggle(item.name)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                <span className="flex-1 text-sm">{item.name}</span>
                <span className="text-sm font-medium tabular-nums">{formatR(item.amountRands)}</span>
              </label>
            ))}
          </div>

          {/* Totals */}
          <div className="grid grid-cols-3 gap-3 bg-primary text-primary-foreground rounded-lg p-4">
            <div>
              <div className="text-xs font-medium opacity-60 uppercase tracking-wider">Deposit</div>
              <div className="text-xl font-bold mt-0.5">{formatR(depositTotal)}</div>
            </div>
            <div>
              <div className="text-xs font-medium opacity-60 uppercase tracking-wider">Balance</div>
              <div className="text-xl font-bold mt-0.5">{formatR(balance)}</div>
            </div>
            <div>
              <div className="text-xs font-medium opacity-60 uppercase tracking-wider">% of total</div>
              <div className="text-xl font-bold mt-0.5">
                {quoteTotalRands > 0 ? Math.round((depositTotal / quoteTotalRands) * 100) : 0}%
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" type="button" onClick={selectDefaults}>
              Reset to defaults
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={() => onChange([])}>
              Clear all
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={() => onChange(items.map((i) => i.name))}>
              Select all
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
