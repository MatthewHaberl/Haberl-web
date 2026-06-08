/**
 * Alert engine — runs after each collector pass for a single system.
 * Phase 1: offline detection only.
 * Phase 2: string_drop, battery_low, grid_loss, fault_code.
 */
import { createClient } from '@supabase/supabase-js'
import type { NormalisedReading } from './types'

import { sendAlertEmail } from './notifications/email'
import { sendWhatsApp } from './notifications/whatsapp'
import { sendSms } from './notifications/sms'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = ReturnType<typeof createClient<any>>

interface AlertRule {
  id: string
  rule_type: string
  threshold_pct: number | null
  threshold_value: number | null
  window_hours: number
  severity: string
  notify_channels: string[]
  notify_admin: boolean
  notify_customer: boolean
  enabled: boolean
}

interface AdminProfile {
  email: string
  phone: string | null
}

async function getAdminProfile(supabase: AnySupabaseClient): Promise<AdminProfile | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('email, phone')
    .eq('role', 'admin')
    .limit(1)
    .single()
  return data as AdminProfile | null
}

async function fireNotifications(
  supabase: AnySupabaseClient,
  ruleId: string | null,
  systemId: string,
  message: string,
  severity: string,
  channels: string[],
  admin: AdminProfile | null
): Promise<void> {
  const notifLog: Array<{ channel: string; sent_at: string; status: string }> = []

  for (const channel of channels) {
    const sentAt = new Date().toISOString()
    try {
      if (channel === 'email' && admin?.email) {
        await sendAlertEmail({
          to: [admin.email],
          subject: `[${severity.toUpperCase()}] Solar monitoring alert`,
          body: message,
        })
        notifLog.push({ channel: 'email', sent_at: sentAt, status: 'sent' })
      }

      if (channel === 'whatsapp' && admin?.phone) {
        await sendWhatsApp(admin.phone, `⚡ Haberl Solar Alert\n${message}`)
        notifLog.push({ channel: 'whatsapp', sent_at: sentAt, status: 'sent' })
      }

      if (channel === 'sms' && admin?.phone) {
        await sendSms(admin.phone, `Haberl Solar: ${message}`)
        notifLog.push({ channel: 'sms', sent_at: sentAt, status: 'sent' })
      }

      if (channel === 'in_app') {
        notifLog.push({ channel: 'in_app', sent_at: sentAt, status: 'stored' })
      }
    } catch (err) {
      notifLog.push({ channel, sent_at: sentAt, status: `error: ${String(err)}` })
    }
  }

  await supabase.from('monitoring_alert_events').insert({
    rule_id:          ruleId,
    system_id:        systemId,
    message,
    severity,
    notification_log: notifLog,
  })
}

export async function runAlertEngine(
  supabase: AnySupabaseClient,
  systemId: string,
  reading: NormalisedReading
): Promise<void> {
  // Fetch enabled rules for this system (or global rules)
  const { data: rules } = await supabase
    .from('monitoring_alert_rules')
    .select('*')
    .eq('enabled', true)
    .or(`system_id.eq.${systemId},system_id.is.null`)

  if (!rules?.length) return

  const admin = await getAdminProfile(supabase)

  for (const rule of rules as AlertRule[]) {
    await evaluateRule(supabase, rule, systemId, reading, admin)
  }
}

async function evaluateRule(
  supabase: AnySupabaseClient,
  rule: AlertRule,
  systemId: string,
  reading: NormalisedReading,
  admin: AdminProfile | null
): Promise<void> {
  // Check if this rule already has an unresolved event for this system
  const { data: existing } = await supabase
    .from('monitoring_alert_events')
    .select('id')
    .eq('rule_id', rule.id)
    .eq('system_id', systemId)
    .is('resolved_at', null)
    .limit(1)

  const hasOpenEvent = !!existing?.length

  switch (rule.rule_type) {
    case 'offline': {
      const isOffline = reading.device_state === 'offline' || reading.device_state === 'unknown'
      if (isOffline && !hasOpenEvent) {
        await fireNotifications(
          supabase, rule.id, systemId,
          `System went offline. Last device state: ${reading.device_state}.`,
          rule.severity, rule.notify_channels, admin
        )
      } else if (!isOffline && hasOpenEvent) {
        // Auto-resolve
        await supabase
          .from('monitoring_alert_events')
          .update({ resolved_at: new Date().toISOString() })
          .eq('rule_id', rule.id)
          .eq('system_id', systemId)
          .is('resolved_at', null)
      }
      break
    }

    case 'fault_code': {
      if (reading.fault_codes.length > 0 && !hasOpenEvent) {
        await fireNotifications(
          supabase, rule.id, systemId,
          `Inverter fault detected: ${reading.fault_codes.join(', ')}.`,
          rule.severity, rule.notify_channels, admin
        )
      } else if (reading.fault_codes.length === 0 && hasOpenEvent) {
        await supabase
          .from('monitoring_alert_events')
          .update({ resolved_at: new Date().toISOString() })
          .eq('rule_id', rule.id)
          .eq('system_id', systemId)
          .is('resolved_at', null)
      }
      break
    }

    case 'battery_low': {
      const threshold = rule.threshold_value ?? 10
      const soc = reading.battery_soc_pct
      if (soc != null && soc < threshold && !hasOpenEvent) {
        await fireNotifications(
          supabase, rule.id, systemId,
          `Battery SOC is low: ${soc}% (threshold: ${threshold}%).`,
          rule.severity, rule.notify_channels, admin
        )
      } else if (soc != null && soc >= threshold + 5 && hasOpenEvent) {
        // 5% hysteresis before auto-resolving
        await supabase
          .from('monitoring_alert_events')
          .update({ resolved_at: new Date().toISOString() })
          .eq('rule_id', rule.id)
          .eq('system_id', systemId)
          .is('resolved_at', null)
      }
      break
    }

    case 'string_drop': {
      // Phase 2: requires baseline data — skip if no baselines stored yet
      if (!reading.pv_strings?.length) break
      const hour = new Date().getHours()
      const { data: baselines } = await supabase
        .from('monitoring_string_baselines')
        .select('string_index, baseline_power_w')
        .eq('system_id', systemId)
        .eq('hour_of_day', hour)

      if (!baselines?.length) break

      const dropThreshold = rule.threshold_pct ?? 30
      const droppedStrings: string[] = []

      for (const baseline of baselines) {
        const current = reading.pv_strings.find((s) => s.string === baseline.string_index)
        if (!current || baseline.baseline_power_w == null || baseline.baseline_power_w < 50) continue
        const dropPct = ((baseline.baseline_power_w - (current.power_w ?? 0)) / baseline.baseline_power_w) * 100
        if (dropPct >= dropThreshold) {
          droppedStrings.push(`String ${current.string} (was ${Math.round(baseline.baseline_power_w)}W, now ${current.power_w ?? 0}W)`)
        }
      }

      if (droppedStrings.length > 0 && !hasOpenEvent) {
        await fireNotifications(
          supabase, rule.id, systemId,
          `String output drop detected: ${droppedStrings.join('; ')}.`,
          rule.severity, rule.notify_channels, admin
        )
      }
      break
    }

    default:
      break
  }
}
