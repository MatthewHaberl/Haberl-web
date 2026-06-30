'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { Loader2, X, Trash2, Save, Mail } from 'lucide-react'
import { CREATABLE_TYPES, KIND_META, STATUS_LABEL } from '@/lib/calendar/events'
import type { CalendarEvent, CalendarEventType, CalendarEventStatus } from '@/types/database'

export interface StaffOption { id: string; full_name: string; role: string }

export interface LinkTarget {
  kind: 'customer' | 'lead'
  id: string
  name: string
  email: string | null
  phone: string | null
  /** Customer's address on file (or a lead's suburb) — pre-fills the location. */
  address: string | null
}

const STATUSES: CalendarEventStatus[] = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']

/** Split an ISO timestamp into local date + HH:MM for the form inputs. */
function splitISO(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function combine(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}`).toISOString()
}

export function EventDialog({
  event,
  prefill,
  defaultDate,
  staff,
  linkTargets,
  currentUserId,
  onClose,
}: {
  /** Editing an existing event, or null to create. */
  event: CalendarEvent | null
  /** Pre-link a new event to a lead/customer. */
  prefill?: { leadId: string | null; customerId: string | null } | null
  /** Default date (YYYY-MM-DD) when creating from a day cell. */
  defaultDate?: string | null
  staff: StaffOption[]
  linkTargets: LinkTarget[]
  currentUserId: string
  onClose: () => void
}) {
  const router = useRouter()
  const isEdit = !!event

  const initialStart = event ? splitISO(event.starts_at) : null
  const initialEnd = event ? splitISO(event.ends_at) : null

  // Resolve a prefill link to its target value ("customer:<id>" / "lead:<id>").
  const prefillLink =
    prefill?.customerId ? `customer:${prefill.customerId}`
    : prefill?.leadId ? `lead:${prefill.leadId}`
    : event?.customer_id ? `customer:${event.customer_id}`
    : event?.lead_id ? `lead:${event.lead_id}`
    : ''

  const [type, setType] = useState<CalendarEventType>(event?.type ?? 'site_meeting')
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(
    initialStart?.date ?? defaultDate ?? splitISO(new Date().toISOString()).date,
  )
  const [startTime, setStartTime] = useState(initialStart?.time ?? '09:00')
  const [endTime, setEndTime] = useState(initialEnd?.time ?? '10:00')
  const [allDay, setAllDay] = useState(event?.all_day ?? false)
  const [status, setStatus] = useState<CalendarEventStatus>(event?.status ?? 'scheduled')
  const [assignedTo, setAssignedTo] = useState(
    event?.assigned_to ?? (staff.some((s) => s.id === currentUserId) ? currentUserId : staff[0]?.id ?? ''),
  )
  const [link, setLink] = useState(prefillLink)
  const [location, setLocation] = useState(event?.location ?? '')
  const [contactName, setContactName] = useState(event?.contact_name ?? '')
  const [contactPhone, setContactPhone] = useState(event?.contact_phone ?? '')
  const [contactEmail, setContactEmail] = useState(event?.contact_email ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-fill contact details when a link target is chosen on a fresh event.
  useEffect(() => {
    if (!link) return
    const [kind, id] = link.split(':')
    const target = linkTargets.find((t) => t.kind === kind && t.id === id)
    if (!target) return
    setContactName((prev) => prev || target.name)
    setContactPhone((prev) => prev || target.phone || '')
    setContactEmail((prev) => prev || target.email || '')
    setLocation((prev) => prev || target.address || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link])

  // Suggest a title from the type + contact if the user hasn't typed one.
  useEffect(() => {
    if (isEdit || title) return
    const who = contactName ? ` — ${contactName}` : ''
    setTitle(`${KIND_META[type].label}${who}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, contactName])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Give the event a title.'); return }
    if (!date) { setError('Pick a date.'); return }
    if (!allDay && endTime < startTime) { setError('End time is before the start time.'); return }

    const [linkKind, linkId] = link ? link.split(':') : [null, null]

    const payload = {
      type,
      title: title.trim(),
      starts_at: allDay ? combine(date, '00:00') : combine(date, startTime),
      ends_at: allDay ? combine(date, '23:59') : combine(date, endTime),
      all_day: allDay,
      status,
      assigned_to: assignedTo || null,
      lead_id: linkKind === 'lead' ? linkId : null,
      customer_id: linkKind === 'customer' ? linkId : null,
      location: location.trim() || null,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      notes: notes.trim() || null,
    }

    setBusy(true)
    const supabase = createClient()
    const { error: dbError } = isEdit
      ? await supabase.from('calendar_events').update(payload).eq('id', event!.id)
      : await supabase.from('calendar_events').insert({ ...payload, created_by: currentUserId })
    setBusy(false)

    if (dbError) { setError(dbError.message); return }
    router.refresh()
    onClose()
  }

  async function handleDelete() {
    if (!event) return
    setBusy(true)
    const supabase = createClient()
    const { error: dbError } = await supabase.from('calendar_events').delete().eq('id', event.id)
    setBusy(false)
    if (dbError) { setError(dbError.message); return }
    router.refresh()
    onClose()
  }

  async function handleEmail() {
    if (!event) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/calendar/events/${event.id}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: contactEmail.trim() || undefined }),
    })
    setBusy(false)
    if (!res.ok) { setError(await res.text()); return }
    const { to } = await res.json()
    setError(`✓ Confirmation sent to ${to}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{isEdit ? 'Edit event' : 'New event'}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3 px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Type" htmlFor="ev-type">
              <Select id="ev-type" value={type} onChange={(e) => setType(e.target.value as CalendarEventType)}>
                {CREATABLE_TYPES.map((t) => <option key={t} value={t}>{KIND_META[t].label}</option>)}
              </Select>
            </FormField>
            <FormField label="Assigned to" htmlFor="ev-assignee">
              <Select id="ev-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{s.id === currentUserId ? ' (you)' : ''}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Title" htmlFor="ev-title" required>
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Site meeting — Michelle" />
          </FormField>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FormField label="Date" htmlFor="ev-date" required>
              <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            {!allDay && (
              <>
                <FormField label="Start" htmlFor="ev-start">
                  <Input id="ev-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </FormField>
                <FormField label="End" htmlFor="ev-end">
                  <Input id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </FormField>
              </>
            )}
            <FormField label="All day" htmlFor="ev-allday">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input id="ev-allday" type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4" />
                <span className="text-muted-foreground">No set time</span>
              </label>
            </FormField>
          </div>

          <FormField label="Link to customer or lead" htmlFor="ev-link" hint="Optional — pulls in their contact details">
            <Select id="ev-link" value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">— None —</option>
              <optgroup label="Customers">
                {linkTargets.filter((t) => t.kind === 'customer').map((t) => (
                  <option key={`customer:${t.id}`} value={`customer:${t.id}`}>{t.name}</option>
                ))}
              </optgroup>
              <optgroup label="Leads">
                {linkTargets.filter((t) => t.kind === 'lead').map((t) => (
                  <option key={`lead:${t.id}`} value={`lead:${t.id}`}>{t.name}{t.phone ? ` · ${t.phone}` : ''}</option>
                ))}
              </optgroup>
            </Select>
          </FormField>

          <FormField label="Location / address" htmlFor="ev-loc">
            <AddressAutocomplete id="ev-loc" value={location} onChange={setLocation} placeholder="Where is it?" />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Contact name" htmlFor="ev-cname">
              <Input id="ev-cname" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </FormField>
            <FormField label="Contact phone" htmlFor="ev-cphone">
              <Input id="ev-cphone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </FormField>
            <FormField label="Contact email" htmlFor="ev-cemail">
              <Input id="ev-cemail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </FormField>
          </div>

          {isEdit && (
            <FormField label="Status" htmlFor="ev-status">
              <Select id="ev-status" value={status} onChange={(e) => setStatus(e.target.value as CalendarEventStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
            </FormField>
          )}

          <FormField label="Notes" htmlFor="ev-notes">
            <Textarea id="ev-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything the worker should know…" />
          </FormField>

          {error && (
            <p className={error.startsWith('✓') ? 'text-xs text-success' : 'text-xs text-destructive'}>{error}</p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              {isEdit && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={handleDelete} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
              {isEdit && (
                <Button type="button" variant="outline" size="sm" onClick={handleEmail} disabled={busy} title="Email a confirmation to the contact">
                  <Mail className="h-3.5 w-3.5" /> Email confirmation
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="accent" size="sm" disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isEdit ? 'Save changes' : 'Create event'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
