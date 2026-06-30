'use client'

import { useSyncExternalStore } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { monthLabel, randToCents, type CashflowRow, type BalanceRow } from '@/lib/finance/budget'
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react'

const RESERVE_KEY = 'haberl.budget.cashOnHand'

// localStorage-backed "cash on hand" — read via useSyncExternalStore so there's
// no setState-in-effect and no SSR/client hydration mismatch (server snapshot is
// always ''). Same-tab writes notify subscribers directly.
const reserveListeners = new Set<() => void>()
function readReserve(): string {
  try { return (typeof window !== 'undefined' && window.localStorage.getItem(RESERVE_KEY)) || '' } catch { return '' }
}
function writeReserve(v: string) {
  try { window.localStorage.setItem(RESERVE_KEY, v) } catch { /* ignore */ }
  reserveListeners.forEach((l) => l())
}
function subscribeReserve(cb: () => void) {
  reserveListeners.add(cb)
  if (typeof window !== 'undefined') window.addEventListener('storage', cb)
  return () => { reserveListeners.delete(cb); if (typeof window !== 'undefined') window.removeEventListener('storage', cb) }
}

export function CashFlowPanel({ cashflow, balances }: { cashflow: CashflowRow[]; balances: BalanceRow[] }) {
  // Reserves: prefer real statement balances; fall back to a manually entered
  // "cash on hand" (persisted locally) so runway still works without balances.
  const bankReserves = balances.reduce((s, b) => s + b.balance_cents, 0)
  const manualReserve = useSyncExternalStore(subscribeReserve, readReserve, () => '')
  const reserves = balances.length > 0 ? bankReserves : (randToCents(manualReserve) ?? 0)

  // Burn = average monthly net over completed months (drop the current/partial
  // month so a half-finished month doesn't skew it).
  const completed = cashflow.length > 1 ? cashflow.slice(0, -1) : cashflow
  const avgNet = completed.length ? Math.round(completed.reduce((s, r) => s + r.net, 0) / completed.length) : 0
  const burning = avgNet < 0
  const runwayMonths = burning && reserves > 0 ? reserves / -avgNet : null

  const maxFlow = Math.max(1, ...cashflow.map((r) => Math.max(r.money_in, -r.money_out)))

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Reserves (cash on hand)" value={formatCurrency(reserves)} icon={Wallet}
          sub={balances.length > 0 ? `${balances.length} account${balances.length === 1 ? '' : 's'}` : 'entered manually'} />
        <Kpi label="Avg monthly net" value={formatCurrency(avgNet)} icon={burning ? TrendingDown : TrendingUp}
          tone={burning ? 'down' : 'up'} sub={`over ${completed.length} month${completed.length === 1 ? '' : 's'}`} />
        <Kpi label="Runway at this burn"
          value={runwayMonths == null ? (burning ? '—' : 'Cash-positive') : `${runwayMonths.toFixed(1)} months`}
          icon={Wallet} tone={runwayMonths != null && runwayMonths < 3 ? 'down' : 'neutral'}
          sub={runwayMonths == null && burning ? 'set reserves to compute' : ' '} />
      </div>

      {balances.length === 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Cash on hand</label>
              <Input value={manualReserve} onChange={(e) => writeReserve(e.target.value)} leadingText="R"
                inputMode="decimal" placeholder="0.00" className="w-40" />
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              Your imported statements don&apos;t carry running balances, so enter your current total cash to
              calculate runway. Saved on this device; re-import statements with a balance column to automate it.
            </p>
          </CardContent>
        </Card>
      )}

      {balances.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Account balances</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {balances.map((b) => (
                <li key={b.account_label} className="flex items-center justify-between">
                  <span>{b.account_label ?? 'Account'} <span className="text-xs text-muted-foreground">· as of {b.as_of}</span></span>
                  <span className="tabular-nums font-medium">{formatCurrency(b.balance_cents)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Monthly flow */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-semibold">Money in vs out — last 12 months</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 text-right font-medium">In</th>
                  <th className="px-4 py-2 text-right font-medium">Out</th>
                  <th className="px-4 py-2 text-right font-medium">Net</th>
                  <th className="px-4 py-2 font-medium">Flow</th>
                </tr>
              </thead>
              <tbody>
                {cashflow.map((r) => (
                  <tr key={r.month} className="border-b border-border/60">
                    <td className="px-4 py-2.5">{monthLabel(r.month)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">{formatCurrency(r.money_in)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-destructive">{formatCurrency(r.money_out)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.net < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{formatCurrency(r.net)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <div className="flex w-24 justify-end"><div className="h-2 rounded-sm bg-emerald-500/70" style={{ width: `${(r.money_in / maxFlow) * 100}%` }} /></div>
                        <div className="flex w-24 justify-start"><div className="h-2 rounded-sm bg-destructive/70" style={{ width: `${(-r.money_out / maxFlow) * 100}%` }} /></div>
                      </div>
                    </td>
                  </tr>
                ))}
                {cashflow.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No bank transactions yet — import statements under Bank Statements.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Kpi({
  label, value, sub, icon: Icon, tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: 'up' | 'down' | 'neutral'
}) {
  const toneCls = tone === 'down' ? 'text-destructive' : tone === 'up' ? 'text-emerald-600' : 'text-foreground'
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}
