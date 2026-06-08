'use client'

import { useEffect, useState } from 'react'
import { Bell, CheckCircle, Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type AlertRule = {
  id: string
  system_id: string | null
  rule_type: string
  threshold_pct: number | null
  threshold_value: number | null
  window_hours: number
  severity: string
  notify_channels: string[]
  notify_admin: boolean
  notify_customer: boolean
  enabled: boolean
  created_at: string
}

type AlertEvent = {
  id: string
  system_id: string
  message: string
  severity: string
  triggered_at: string
  resolved_at: string | null
  monitoring_systems?: { label: string | null; brand: string; sites?: { name: string } | null } | null
}

const RULE_TYPE_LABELS: Record<string, string> = {
  offline:      'System offline',
  string_drop:  'String output drop',
  battery_low:  'Battery SOC low',
  grid_loss:    'Grid loss detected',
  fault_code:   'Inverter fault code',
  export_limit: 'Export limit breach',
  custom:       'Custom rule',
}

const SEVERITY_VARIANT: Record<string, 'destructive' | 'warning' | 'default'> = {
  critical: 'destructive',
  warning:  'warning',
  info:     'default',
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const DEFAULT_RULES = [
  { rule_type: 'offline',     severity: 'critical', notify_channels: ['email', 'whatsapp', 'in_app'], threshold_value: 20, window_hours: 1, label: 'System offline > 20 min' },
  { rule_type: 'fault_code',  severity: 'critical', notify_channels: ['email', 'whatsapp', 'in_app'], threshold_value: null, window_hours: 1, label: 'Any inverter fault code' },
  { rule_type: 'string_drop', severity: 'warning',  notify_channels: ['email', 'in_app'], threshold_pct: 30, window_hours: 1, label: 'String drops ≥ 30% vs 7-day baseline' },
  { rule_type: 'battery_low', severity: 'warning',  notify_channels: ['email', 'in_app'], threshold_value: 10, window_hours: 1, label: 'Battery SOC < 10%' },
]

export default function AlertsPage() {
  const [rules, setRules]     = useState<AlertRule[]>([])
  const [events, setEvents]   = useState<AlertEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const supabase = createClient()

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: e }] = await Promise.all([
      supabase.from('monitoring_alert_rules').select('*').order('created_at'),
      supabase
        .from('monitoring_alert_events')
        .select('id, system_id, message, severity, triggered_at, resolved_at, monitoring_systems ( label, brand, sites ( name ) )')
        .order('triggered_at', { ascending: false })
        .limit(30),
    ])
    setRules((r ?? []) as AlertRule[])
    setEvents((e ?? []) as unknown as AlertEvent[])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  async function toggleRule(id: string, enabled: boolean) {
    await supabase.from('monitoring_alert_rules').update({ enabled }).eq('id', id)
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled } : r))
  }

  async function deleteRule(id: string) {
    await supabase.from('monitoring_alert_rules').delete().eq('id', id)
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  async function acknowledgeEvent(id: string) {
    await supabase
      .from('monitoring_alert_events')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id)
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, resolved_at: new Date().toISOString() } : e))
  }

  async function seedDefaultRules() {
    setSaving(true)
    for (const rule of DEFAULT_RULES) {
      await supabase.from('monitoring_alert_rules').insert({
        system_id:       null,
        rule_type:       rule.rule_type,
        threshold_pct:   (rule as { threshold_pct?: number }).threshold_pct ?? null,
        threshold_value: rule.threshold_value ?? null,
        window_hours:    rule.window_hours,
        severity:        rule.severity,
        notify_channels: rule.notify_channels,
        notify_admin:    true,
        notify_customer: false,
        enabled:         true,
      })
    }
    await load()
    setSaving(false)
  }

  const openEvents = events.filter((e) => !e.resolved_at)

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alert Rules</h1>
          <p className="text-sm text-muted-foreground">Define when to get notified about system issues.</p>
        </div>
        {rules.length === 0 && (
          <Button onClick={seedDefaultRules} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add default rules
          </Button>
        )}
      </div>

      {/* Open alerts */}
      {openEvents.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Bell className="h-5 w-5" />
              {openEvents.length} open alert{openEvents.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openEvents.map((event) => {
              const sysLabel = event.monitoring_systems?.label ?? event.monitoring_systems?.brand ?? 'System'
              const siteName = (event.monitoring_systems?.sites as unknown as { name: string } | null)?.name
              return (
                <div key={event.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[event.severity] ?? 'default'}>{event.severity}</Badge>
                      <span className="text-xs text-muted-foreground">{timeAgo(event.triggered_at)}</span>
                    </div>
                    <p className="mt-1 text-sm">{event.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{siteName ?? sysLabel}</p>
                  </div>
                  <button
                    onClick={() => acknowledgeEvent(event.id)}
                    className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
                    title="Mark resolved"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      <Card>
        <CardHeader>
          <CardTitle>Configured rules</CardTitle>
          <CardDescription>
            Global rules (no system specified) apply to all monitored systems.
            Toggle to enable or disable without deleting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rules yet. Click &ldquo;Add default rules&rdquo; to seed the recommended starting set.
            </p>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type}</p>
                    <Badge variant={SEVERITY_VARIANT[rule.severity] ?? 'default'}>{rule.severity}</Badge>
                    {!rule.enabled && <Badge variant="outline">Disabled</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Channels: {rule.notify_channels.join(', ') || 'none'}
                    {rule.threshold_pct && ` · Drop ≥ ${rule.threshold_pct}%`}
                    {rule.threshold_value && ` · Threshold ${rule.threshold_value}`}
                    {!rule.system_id && ' · Global (all systems)'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleRule(rule.id, !rule.enabled)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={rule.enabled ? 'Disable' : 'Enable'}
                  >
                    {rule.enabled
                      ? <ToggleRight className="h-5 w-5 text-accent" />
                      : <ToggleLeft className="h-5 w-5" />
                    }
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Alert history */}
      {events.filter((e) => e.resolved_at).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alert history</CardTitle>
            <CardDescription>Resolved alerts from the last 30 events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.filter((e) => e.resolved_at).map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                <div>
                  <p className="text-muted-foreground line-clamp-1">{event.message}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(event.triggered_at)} · resolved</p>
                </div>
                <Badge variant="outline">{event.severity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
