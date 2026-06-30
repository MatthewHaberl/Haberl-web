'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { KIND_META, kindLabel, timeLabel, type CalendarItem } from '@/lib/calendar/events'
import type { CalendarEvent } from '@/types/database'
import { EventDialog, type StaffOption, type LinkTarget } from './EventDialog'

type ViewMode = 'month' | 'week' | 'day'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const UNASSIGNED = '__unassigned__'

function pad(n: number) { return String(n).padStart(2, '0') }
function dateKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function monthKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }
function localKey(iso: string) { return dateKey(new Date(iso)) }
function sameDay(a: Date, b: Date) { return dateKey(a) === dateKey(b) }
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }
/** Monday-of-week for a date. */
function weekStart(d: Date) { return addDays(d, -((d.getDay() + 6) % 7)) }

export function CalendarView({
  items, staff, linkTargets, currentUserId, isManager,
  focusMonth, windowStart, windowEnd, prefill,
}: {
  items: CalendarItem[]
  staff: StaffOption[]
  linkTargets: LinkTarget[]
  currentUserId: string
  isManager: boolean
  focusMonth: string
  windowStart: string
  windowEnd: string
  prefill: { leadId: string | null; customerId: string | null } | null
}) {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => {
    const [y, m] = focusMonth.split('-').map(Number)
    const today = new Date()
    // Land on today if it's inside the focused month, else the 1st.
    return today.getFullYear() === y && today.getMonth() === m - 1 ? today : new Date(y, m - 1, 1)
  })
  const [activeWorkers, setActiveWorkers] = useState<Set<string>>(
    () => new Set([...staff.map((s) => s.id), UNASSIGNED]),
  )
  const [dialog, setDialog] = useState<
    { event: CalendarEvent | null; defaultDate: string | null } | null
  >(prefill ? { event: null, defaultDate: null } : null)
  const [dragItem, setDragItem] = useState<CalendarItem | null>(null)

  // Reload from the server when navigation steps outside the loaded window.
  useEffect(() => {
    if (cursor < new Date(windowStart) || cursor >= new Date(windowEnd)) {
      router.push(`/portal/employee/calendar?month=${monthKey(cursor)}`)
    }
  }, [cursor, windowStart, windowEnd, router])

  const visible = useMemo(
    () => items.filter((it) => activeWorkers.has(it.assignedTo ?? UNASSIGNED)),
    [items, activeWorkers],
  )
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const it of visible) {
      const k = localKey(it.start)
      const list = map.get(k) ?? []
      list.push(it)
      map.set(k, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1))
    }
    return map
  }, [visible])

  function toggleWorker(id: string) {
    setActiveWorkers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function step(dir: 1 | -1) {
    if (view === 'month') setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1))
    else if (view === 'week') setCursor((c) => addDays(c, 7 * dir))
    else setCursor((c) => addDays(c, dir))
  }

  function openItem(it: CalendarItem) {
    if (it.source === 'event' && it.event) setDialog({ event: it.event, defaultDate: null })
    else if (it.href) router.push(it.href)
  }

  // Drag an event onto another day to reschedule it (time-of-day + duration kept).
  // Jobs are read-only here — they're rescheduled on the job itself.
  async function reschedule(item: CalendarItem, targetDayKey: string) {
    if (item.source !== 'event' || !item.event) return
    if (localKey(item.start) === targetDayKey) return
    const [ty, tm, td] = targetDayKey.split('-').map(Number)
    const s = new Date(item.start)
    const e = new Date(item.end)
    const newStart = new Date(ty, tm - 1, td, s.getHours(), s.getMinutes())
    const newEnd = new Date(newStart.getTime() + (e.getTime() - s.getTime()))
    const supabase = createClient()
    await supabase
      .from('calendar_events')
      .update({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() })
      .eq('id', item.event.id)
    router.refresh()
  }

  const heading = view === 'month'
    ? cursor.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
    : view === 'week'
    ? (() => {
        const ws = weekStart(cursor); const we = addDays(ws, 6)
        return `${ws.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} – ${we.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`
      })()
    : cursor.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          <h2 className="ml-1 text-lg font-semibold">{heading}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(['month', 'week', 'day'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium capitalize transition-colors',
                  view === v ? 'bg-accent text-white' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button variant="accent" size="sm" onClick={() => setDialog({ event: null, defaultDate: dateKey(cursor) })}>
            <Plus className="h-3.5 w-3.5" /> New event
          </Button>
        </div>
      </div>

      {/* Legend + worker filter */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(KIND_META).map(([k, m]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('h-2.5 w-2.5 rounded-sm', m.swatch)} />
              {m.label}
            </span>
          ))}
        </div>
        {isManager && staff.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Workers:</span>
            {staff.map((s) => {
              const on = activeWorkers.has(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => toggleWorker(s.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                    on ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s.full_name}{s.id === currentUserId ? ' (you)' : ''}
                </button>
              )
            })}
            <button
              onClick={() => toggleWorker(UNASSIGNED)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                activeWorkers.has(UNASSIGNED) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              Unassigned
            </button>
          </div>
        )}
      </div>

      {view === 'month' && (
        <MonthGrid
          cursor={cursor}
          byDay={byDay}
          onDay={(d) => { setCursor(d); setView('day') }}
          onItem={openItem}
          onAdd={(d) => setDialog({ event: null, defaultDate: dateKey(d) })}
          dragItem={dragItem}
          onItemDragStart={setDragItem}
          onItemDragEnd={() => setDragItem(null)}
          onDropDay={(dayKey) => { if (dragItem) reschedule(dragItem, dayKey); setDragItem(null) }}
        />
      )}
      {view === 'week' && (
        <WeekAgenda cursor={cursor} byDay={byDay} onItem={openItem} onAdd={(d) => setDialog({ event: null, defaultDate: dateKey(d) })} />
      )}
      {view === 'day' && (
        <DayAgenda cursor={cursor} items={byDay.get(dateKey(cursor)) ?? []} onItem={openItem} onAdd={() => setDialog({ event: null, defaultDate: dateKey(cursor) })} />
      )}

      {dialog && (
        <EventDialog
          event={dialog.event}
          prefill={dialog.event ? null : prefill}
          defaultDate={dialog.defaultDate}
          staff={staff}
          linkTargets={linkTargets}
          currentUserId={currentUserId}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function ItemChip({
  it, onClick, draggable, onDragStart, onDragEnd,
}: {
  it: CalendarItem
  onClick: () => void
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const meta = KIND_META[it.kind]
  const canDrag = draggable && it.source === 'event'
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => { e.stopPropagation(); onDragStart?.() } : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      title={
        `${kindLabel(it.kind)} · ${it.title}${it.assigneeName ? ` · ${it.assigneeName}` : ''}` +
        (canDrag ? ' · drag to reschedule' : '')
      }
      className={cn(
        'flex w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-80',
        meta.block,
        canDrag && 'cursor-grab active:cursor-grabbing',
        (it.status === 'cancelled' || it.status === 'no_show') && 'line-through opacity-60',
      )}
    >
      {!it.allDay && <span className="font-semibold tabular-nums">{timeLabel(it.start)}</span>}
      <span className="truncate">{it.title}</span>
    </button>
  )
}

function MonthGrid({
  cursor, byDay, onDay, onItem, onAdd, dragItem, onItemDragStart, onItemDragEnd, onDropDay,
}: {
  cursor: Date
  byDay: Map<string, CalendarItem[]>
  onDay: (d: Date) => void
  onItem: (it: CalendarItem) => void
  onAdd: (d: Date) => void
  dragItem: CalendarItem | null
  onItemDragStart: (it: CalendarItem) => void
  onItemDragEnd: () => void
  onDropDay: (dayKey: string) => void
}) {
  const year = cursor.getFullYear(); const month = cursor.getMonth()
  const first = new Date(year, month, 1)
  const gridStart = addDays(first, -((first.getDay() + 6) % 7))
  const today = new Date()
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month
          const list = byDay.get(dateKey(d)) ?? []
          const isToday = sameDay(d, today)
          return (
            <div
              key={i}
              onClick={() => onAdd(d)}
              onDragOver={dragItem ? (e) => e.preventDefault() : undefined}
              onDrop={dragItem ? (e) => { e.preventDefault(); onDropDay(dateKey(d)) } : undefined}
              className={cn(
                'group min-h-[104px] cursor-pointer border-b border-r border-border p-1 transition-colors hover:bg-muted/30',
                i % 7 === 6 && 'border-r-0',
                !inMonth && 'bg-muted/20 text-muted-foreground',
                dragItem && localKey(dragItem.start) !== dateKey(d) && 'hover:bg-accent/10 hover:ring-1 hover:ring-accent/40',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-xs',
                  isToday && 'bg-accent font-semibold text-white',
                  !isToday && !inMonth && 'opacity-50',
                )}>
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {list.slice(0, 3).map((it) => (
                  <ItemChip
                    key={it.id}
                    it={it}
                    onClick={() => onItem(it)}
                    draggable
                    onDragStart={() => onItemDragStart(it)}
                    onDragEnd={onItemDragEnd}
                  />
                ))}
                {list.length > 3 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDay(d) }}
                    className="px-1 text-left text-[11px] font-medium text-accent hover:underline"
                  >
                    +{list.length - 3} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekAgenda({
  cursor, byDay, onItem, onAdd,
}: {
  cursor: Date
  byDay: Map<string, CalendarItem[]>
  onItem: (it: CalendarItem) => void
  onAdd: (d: Date) => void
}) {
  const ws = weekStart(cursor)
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((d) => {
        const list = byDay.get(dateKey(d)) ?? []
        const isToday = sameDay(d, today)
        return (
          <div key={dateKey(d)} className="flex min-h-[160px] flex-col rounded-lg border border-border">
            <div className={cn('flex items-center justify-between border-b border-border px-2 py-1.5', isToday && 'bg-accent/10')}>
              <span className="text-xs font-semibold">
                {d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' })}
              </span>
              <button onClick={() => onAdd(d)} className="text-muted-foreground hover:text-accent" aria-label="Add event">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-1 p-1.5">
              {list.length === 0
                ? <span className="px-1 text-[11px] text-muted-foreground/60">—</span>
                : list.map((it) => <ItemChip key={it.id} it={it} onClick={() => onItem(it)} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DayAgenda({
  cursor, items, onItem, onAdd,
}: {
  cursor: Date
  items: CalendarItem[]
  onItem: (it: CalendarItem) => void
  onAdd: () => void
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold">
          {cursor.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        <Button variant="outline" size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => {
            const meta = KIND_META[it.kind]
            return (
              <li key={it.id}>
                <button
                  onClick={() => onItem(it)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30"
                >
                  <span className="w-16 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                    {it.allDay ? 'All day' : timeLabel(it.start)}
                  </span>
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', meta.swatch)} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm font-medium', (it.status === 'cancelled' || it.status === 'no_show') && 'line-through opacity-60')}>
                      {it.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {kindLabel(it.kind)}
                      {it.assigneeName ? ` · ${it.assigneeName}` : ''}
                      {it.location ? ` · ${it.location}` : ''}
                    </span>
                  </span>
                  {it.source === 'job' && <span className="shrink-0 text-xs text-accent">Open job →</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
