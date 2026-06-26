'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Building2,
  Download,
  ExternalLink,
  Loader2,
  MapPinned,
  Radar,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SunMedium,
} from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'

type SolarStatus = 'covered' | 'marginal' | 'not_covered' | 'error' | 'not_checked'

interface RoofCandidate {
  id: string
  osmId: number
  name: string | null
  label: string
  category: string
  footprintM2: number
  latitude: number
  longitude: number
  address: string | null
  mapUrl: string
  osmUrl: string
  tags: {
    building?: string
    amenity?: string
    shop?: string
    tourism?: string
    office?: string
  }
  solar?: {
    status: SolarStatus
    imageryQuality?: string
    imageryDate?: string | null
    panelCount?: number
    maxKw?: number | null
    annualKwh?: number | null
    roofSegments?: number | null
    roofAreaM2?: number | null
    message?: string
  }
}

interface ScanResponse {
  area: {
    label: string
    center: {
      latitude: number
      longitude: number
    }
    bbox: {
      south: number
      north: number
      west: number
      east: number
    }
  }
  checkedAt: string
  inputs: {
    area: string
    maxCandidates: number
    minFootprintM2: number
    solarLimit: number
    expandedCoverage: boolean
  }
  summary: {
    buildingFootprints: number
    candidates: number
    solarChecked: number
    solarCovered: number
    googleSolarConfigured: boolean
  }
  candidates: RoofCandidate[]
}

const SAMPLE_AREAS = [
  'Douglasdale',
  'Linbro Park',
  'Kya Sands',
  'Samrand',
  'Wadeville',
  'Isando',
]

const SOLAR_BADGE: Record<SolarStatus, {
  label: string
  variant: 'success' | 'warning' | 'destructive' | 'outline' | 'default'
}> = {
  covered: { label: 'Solar data', variant: 'success' },
  marginal: { label: 'Marginal', variant: 'warning' },
  not_covered: { label: 'No Solar data', variant: 'outline' },
  error: { label: 'Error', variant: 'destructive' },
  not_checked: { label: 'Footprint only', variant: 'default' },
}

function formatNumber(value: number | null | undefined, suffix = '') {
  if (value == null) return 'n/a'
  return `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(value)}${suffix}`
}

function formatKw(value: number | null | undefined) {
  if (value == null) return 'n/a'
  return value >= 1000 ? `${(value / 1000).toFixed(2)} MWp` : `${value.toFixed(1)} kWp`
}

function formatKwh(value: number | null | undefined) {
  if (value == null) return 'n/a'
  return value >= 1000000 ? `${(value / 1000000).toFixed(1)} GWh` : `${formatNumber(value)} kWh`
}

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(data: ScanResponse) {
  const headers = [
    'Rank',
    'Name',
    'Category',
    'Footprint m2',
    'Solar status',
    'Panels',
    'Max kWp',
    'Annual kWh',
    'Solar roof m2',
    'Imagery quality',
    'Latitude',
    'Longitude',
    'Map URL',
    'OSM URL',
  ]
  const rows = data.candidates.map((candidate, index) => [
    index + 1,
    candidate.label,
    candidate.category,
    candidate.footprintM2,
    candidate.solar?.status,
    candidate.solar?.panelCount,
    candidate.solar?.maxKw,
    candidate.solar?.annualKwh,
    candidate.solar?.roofAreaM2,
    candidate.solar?.imageryQuality,
    candidate.latitude,
    candidate.longitude,
    candidate.mapUrl,
    candidate.osmUrl,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `roof-scan-${data.inputs.area.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function targetScore(candidate: RoofCandidate) {
  if (candidate.solar?.maxKw) return candidate.solar.maxKw
  return candidate.footprintM2 / 10
}

function CandidateRow({ candidate, rank }: { candidate: RoofCandidate; rank: number }) {
  const solarStatus = candidate.solar?.status ?? 'not_checked'
  const solarMeta = SOLAR_BADGE[solarStatus]

  return (
    <div className="grid gap-4 border-b border-border px-4 py-4 last:border-0 xl:grid-cols-[56px_minmax(260px,1.35fr)_minmax(360px,1.9fr)_116px]">
      <div className="flex items-center gap-3 xl:block">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-sm font-semibold text-foreground">
          {rank}
        </span>
        <Badge className="xl:hidden" variant={solarMeta.variant}>{solarMeta.label}</Badge>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{candidate.label}</h3>
          <Badge variant="outline">{candidate.category}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {candidate.address ?? `${candidate.latitude.toFixed(5)}, ${candidate.longitude.toFixed(5)}`}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          OSM footprint: <span className="font-medium text-foreground">{formatNumber(candidate.footprintM2, ' m2')}</span>
        </p>
      </div>

      <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="block text-sm font-semibold text-foreground">{formatKw(candidate.solar?.maxKw)}</span>
          <span>solar size</span>
        </div>
        <div>
          <span className="block text-sm font-semibold text-foreground">{formatNumber(candidate.solar?.panelCount)}</span>
          <span>panels</span>
        </div>
        <div>
          <span className="block text-sm font-semibold text-foreground">{formatKwh(candidate.solar?.annualKwh)}</span>
          <span>annual yield</span>
        </div>
        <div>
          <span className="block text-sm font-semibold text-foreground">
            {candidate.solar?.imageryQuality ?? 'n/a'}
            {candidate.solar?.imageryDate ? `, ${candidate.solar.imageryDate}` : ''}
          </span>
          <span>imagery</span>
        </div>
      </div>

      <div className="flex items-center gap-2 xl:flex-col xl:items-stretch">
        <Badge className="hidden justify-center xl:inline-flex" variant={solarMeta.variant}>{solarMeta.label}</Badge>
        <Button asChild variant="outline" size="sm">
          <a href={candidate.mapUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Map
          </a>
        </Button>
      </div>
    </div>
  )
}

export function AreaRoofScanner() {
  const [area, setArea] = useState('Douglasdale')
  const [maxCandidates, setMaxCandidates] = useState(30)
  const [minFootprintM2, setMinFootprintM2] = useState(1000)
  const [solarLimit, setSolarLimit] = useState(12)
  const [expandedCoverage, setExpandedCoverage] = useState(true)
  const [data, setData] = useState<ScanResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const rankedCandidates = useMemo(() => {
    if (!data) return []
    return [...data.candidates].sort((a, b) => targetScore(b) - targetScore(a))
  }, [data])

  async function runScan(nextArea = area) {
    const trimmedArea = nextArea.trim()
    if (!trimmedArea) {
      setError('Enter a suburb or commercial area.')
      return
    }

    setArea(trimmedArea)
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/lead-finder/area-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area: trimmedArea,
          maxCandidates,
          minFootprintM2,
          solarLimit,
          expandedCoverage,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Area scan failed')
      }

      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Area scan failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageShell width="full">
      <PageHeader
        icon={Radar}
        title="Lead Finder"
        description="Scan a Gauteng suburb or business district for large roof footprints, then enrich the top targets with Google Solar estimates."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/portal/employee/lead-finder/solar-coverage">
                <SunMedium className="h-4 w-4" />
                Coverage tester
              </Link>
            </Button>
            {data && (
              <Button variant="outline" onClick={() => downloadCsv(data)}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPinned className="h-4 w-4 text-accent" />
            Area Scan
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') runScan()
                }}
                placeholder="Douglasdale, Linbro Park, Wadeville..."
                className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <Button onClick={() => runScan()} disabled={loading} variant="accent">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Scan area
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {SAMPLE_AREAS.map((sample) => (
                <Button
                  key={sample}
                  type="button"
                  size="sm"
                  variant={sample === area ? 'default' : 'outline'}
                  onClick={() => runScan(sample)}
                  disabled={loading}
                >
                  {sample}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Min footprint
              </span>
              <input
                type="number"
                min={250}
                max={10000}
                step={250}
                value={minFootprintM2}
                onChange={(event) => setMinFootprintM2(Number(event.target.value))}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>Roof rows</span>
              <input
                type="number"
                min={5}
                max={80}
                value={maxCandidates}
                onChange={(event) => setMaxCandidates(Number(event.target.value))}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>Solar checks</span>
              <input
                type="number"
                min={0}
                max={20}
                value={solarLimit}
                onChange={(event) => setSolarLimit(Number(event.target.value))}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <label className="flex h-10 items-center gap-2 self-end rounded-md border border-border px-3 text-sm">
              <input
                type="checkbox"
                checked={expandedCoverage}
                onChange={(event) => setExpandedCoverage(event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Expanded
            </label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{formatNumber(data.summary.buildingFootprints)}</p>
              <p className="text-xs text-muted-foreground">OSM footprints found</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{formatNumber(data.summary.candidates)}</p>
              <p className="text-xs text-muted-foreground">large roof candidates</p>
            </CardContent>
          </Card>
          <Card className="border-success/40">
            <CardContent className="pt-6">
              <p className="text-3xl font-bold text-success">{formatNumber(data.summary.solarCovered)}</p>
              <p className="text-xs text-muted-foreground">with Solar API data</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-bold">{formatNumber(data.summary.solarChecked)}</p>
              <p className="text-xs text-muted-foreground">solar checks used</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-semibold text-foreground">{data.area.label.split(',').slice(0, 2).join(',')}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                scanned {new Date(data.checkedAt).toLocaleString('en-ZA')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {data && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-accent" />
                Ranked Roofs
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Sorted by Solar API system size where available, otherwise by OSM footprint area.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setData(null)}>
              <RotateCcw className="h-4 w-4" />
              Clear
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {rankedCandidates.length > 0 ? (
              rankedCandidates.map((candidate, index) => (
                <CandidateRow key={candidate.id} candidate={candidate} rank={index + 1} />
              ))
            ) : (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                No roofs matched that footprint threshold. Lower the minimum footprint and scan again.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}
