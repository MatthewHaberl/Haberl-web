'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MapPinned,
  Play,
  Radar,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'

type ImageryQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'BASE'
type CoverageStatus = 'covered' | 'marginal' | 'not_covered' | 'error'

interface CoverageLocation {
  label: string
  address: string
}

interface CoverageResult extends CoverageLocation {
  status: CoverageStatus
  message: string
  formattedAddress?: string
  latitude?: number
  longitude?: number
  imageryQuality?: string
  imageryDate?: string | null
  imageryProcessedDate?: string | null
  panelCount?: number
  maxKw?: number | null
  annualKwh?: number | null
  roofSegments?: number
  roofAreaM2?: number | null
  panelCapacityWatts?: number | null
  geocodeMs?: number
  elapsedMs?: number
}

interface CoverageResponse {
  requiredQuality: ImageryQuality
  expandedCoverage: boolean
  checkedAt: string
  summary: {
    total: number
    covered: number
    marginal: number
    notCovered: number
    errors: number
    usefulRate: number
  }
  results: CoverageResult[]
}

const GAUTENG_TEST_LOCATIONS: CoverageLocation[] = [
  {
    label: 'Sandton residential',
    address: '14 Twelfth Avenue, Parkmore, Sandton, Gauteng',
  },
  {
    label: 'Randburg residential',
    address: '45 Dale Lace Avenue, Randpark Ridge, Randburg, Gauteng',
  },
  {
    label: 'Midrand estate',
    address: '26 Walton Avenue, Carlswald, Midrand, Gauteng',
  },
  {
    label: 'Centurion residential',
    address: '104 Cantonments Road, Lyttelton Manor, Centurion, Gauteng',
  },
  {
    label: 'Pretoria East',
    address: '505 Jacqueline Drive, Garsfontein, Pretoria, Gauteng',
  },
  {
    label: 'Roodepoort residential',
    address: '31 Ruhamah Drive, Helderkruin, Roodepoort, Gauteng',
  },
  {
    label: 'Benoni residential',
    address: '87 Great North Road, Brentwood Park, Benoni, Gauteng',
  },
  {
    label: 'Alberton residential',
    address: '54 Hennie Alberts Street, Brackenhurst, Alberton, Gauteng',
  },
]

const STATUS_META: Record<CoverageStatus, {
  label: string
  badge: 'success' | 'warning' | 'destructive' | 'outline'
  Icon: typeof CheckCircle2
}> = {
  covered: {
    label: 'Useful',
    badge: 'success',
    Icon: CheckCircle2,
  },
  marginal: {
    label: 'Marginal',
    badge: 'warning',
    Icon: AlertTriangle,
  },
  not_covered: {
    label: 'No roof data',
    badge: 'outline',
    Icon: XCircle,
  },
  error: {
    label: 'Error',
    badge: 'destructive',
    Icon: AlertTriangle,
  },
}

function formatNumber(value: number | null | undefined, suffix = '') {
  if (value == null) return 'n/a'
  return `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(value)}${suffix}`
}

function formatKw(value: number | null | undefined) {
  if (value == null) return 'n/a'
  return `${value.toFixed(1)} kWp`
}

function Verdict({ data }: { data: CoverageResponse | null }) {
  if (!data) {
    return (
      <div className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        Run the Gauteng smoke test first. A lead-finder scan is worth building only if enough addresses return roof-level panel placements.
      </div>
    )
  }

  const rate = data.summary.usefulRate
  const strong = data.summary.total >= 5 && rate >= 60
  const weak = rate < 25

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${
      strong
        ? 'border-success/40 bg-success/5 text-success'
        : weak
          ? 'border-warning/40 bg-warning/5 text-warning'
          : 'border-border bg-muted/30 text-foreground'
    }`}>
      <span className="font-semibold">
        {strong ? 'Proceed to suburb scanning.' : weak ? 'Do not build the scanner yet.' : 'Coverage is mixed.'}
      </span>{' '}
      {data.summary.covered} of {data.summary.total} addresses returned useful roof data
      ({rate}%). Re-test with the exact target suburbs before using this as a paid lead source.
    </div>
  )
}

function ResultRow({ result }: { result: CoverageResult }) {
  const meta = STATUS_META[result.status] ?? STATUS_META.error
  const Icon = meta.Icon

  return (
    <div className="grid gap-3 border-b border-border px-4 py-3 last:border-0 lg:grid-cols-[minmax(220px,1.15fr)_110px_minmax(360px,2fr)]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium">{result.label}</p>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{result.formattedAddress ?? result.address}</p>
      </div>

      <div>
        <Badge variant={meta.badge}>{meta.label}</Badge>
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <span className="block font-medium text-foreground">{formatNumber(result.panelCount)}</span>
          <span>panels</span>
        </div>
        <div>
          <span className="block font-medium text-foreground">{formatKw(result.maxKw)}</span>
          <span>max array</span>
        </div>
        <div>
          <span className="block font-medium text-foreground">{formatNumber(result.roofAreaM2, ' m2')}</span>
          <span>roof area</span>
        </div>
        <div>
          <span className="block font-medium text-foreground">
            {result.imageryQuality ?? 'n/a'}{result.imageryDate ? `, ${result.imageryDate}` : ''}
          </span>
          <span>imagery</span>
        </div>
        <div className="sm:col-span-2 xl:col-span-4">
          <span>{result.message}</span>
        </div>
      </div>
    </div>
  )
}

export function SolarCoverageTester() {
  const [requiredQuality, setRequiredQuality] = useState<ImageryQuality>('LOW')
  const [expandedCoverage, setExpandedCoverage] = useState(false)
  const [customAddress, setCustomAddress] = useState('')
  const [data, setData] = useState<CoverageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<'samples' | 'custom' | null>(null)

  const sortedResults = useMemo(() => {
    if (!data) return []
    const order: CoverageStatus[] = ['covered', 'marginal', 'not_covered', 'error']
    return [...data.results].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
  }, [data])

  async function runCoverage(locations: CoverageLocation[], mode: 'samples' | 'custom') {
    setLoading(mode)
    setError(null)

    try {
      const response = await fetch('/api/solar-coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations, requiredQuality, expandedCoverage }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Coverage check failed')
      }

      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Coverage check failed')
    } finally {
      setLoading(null)
    }
  }

  function runSamples() {
    runCoverage(GAUTENG_TEST_LOCATIONS, 'samples')
  }

  function runCustom() {
    const address = customAddress.trim()
    if (!address) {
      setError('Enter a Gauteng address to test.')
      return
    }
    runCoverage([{ label: 'Custom address', address }], 'custom')
  }

  return (
    <PageShell width="full">
      <PageHeader
        icon={MapPinned}
        title="Solar Coverage"
        description="Validate whether Google Solar returns roof-level data in Gauteng before investing in automated suburb scanning."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/portal/employee/lead-finder/area-scan">
                <Radar className="h-4 w-4" />
                Area scanner
              </Link>
            </Button>

            <select
              value={requiredQuality}
              onChange={(event) => setRequiredQuality(event.target.value as ImageryQuality)}
              disabled={expandedCoverage}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="HIGH">High quality</option>
              <option value="MEDIUM">Medium quality</option>
              <option value="LOW">Low quality</option>
              <option value="BASE">Base quality</option>
            </select>

            <label className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm">
              <input
                type="checkbox"
                checked={expandedCoverage}
                onChange={(event) => {
                  setExpandedCoverage(event.target.checked)
                  if (event.target.checked) setRequiredQuality('BASE')
                }}
                className="h-4 w-4 accent-accent"
              />
              Expanded coverage
            </label>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coverage Test</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-3">
            <Button onClick={runSamples} disabled={loading !== null} className="w-full justify-start" variant="accent">
              {loading === 'samples' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Gauteng smoke test
            </Button>
            <p className="text-xs text-muted-foreground">
              Tests {GAUTENG_TEST_LOCATIONS.length} residential addresses across Johannesburg, Pretoria, Ekurhuleni, and the West Rand.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <AddressAutocomplete
                value={customAddress}
                onChange={setCustomAddress}
                placeholder="Test a specific Gauteng address..."
              />
              <Button onClick={runCustom} disabled={loading !== null} variant="outline">
                {loading === 'custom' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Test
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this after a sample run for an actual quote lead, estate, or suburb anchor point.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Verdict data={data} />

      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="border-success/40">
            <CardContent className="pt-6">
              <p className="text-3xl font-bold text-success">{data.summary.covered}</p>
              <p className="text-xs text-muted-foreground">useful roofs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{data.summary.usefulRate}%</p>
              <p className="text-xs text-muted-foreground">useful rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{data.summary.marginal}</p>
              <p className="text-xs text-muted-foreground">marginal</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{data.summary.notCovered}</p>
              <p className="text-xs text-muted-foreground">not covered</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{data.summary.errors}</p>
              <p className="text-xs text-muted-foreground">errors</p>
            </CardContent>
          </Card>
        </div>
      )}

      {data && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Address Results</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Quality: {data.requiredQuality}
                {data.expandedCoverage ? ' with EXPANDED_COVERAGE' : ''} | checked {new Date(data.checkedAt).toLocaleString('en-ZA')}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setData(null)}>
              <RotateCcw className="h-4 w-4" />
              Clear
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {sortedResults.map((result) => (
              <ResultRow key={`${result.label}-${result.address}`} result={result} />
            ))}
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}
