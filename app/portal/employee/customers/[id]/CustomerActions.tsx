'use client'

import { CalendarDays, FileText, MapPinPlus, Plus, Wrench } from 'lucide-react'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu'
import { useAddSite } from './AddSiteDialog'

/**
 * "New ▾" on the customer header — every record that hangs off a customer can
 * be started from the customer's own page, with the customer already filled in,
 * instead of navigating to Quotes/Jobs/Calendar and searching for them again.
 *
 * Must be rendered inside <AddSiteProvider> — "Site" opens the inline site form
 * further down the page rather than navigating away.
 */
export function CustomerActions({
  customerId,
  canQuote,
  canJob,
  canSchedule,
}: {
  customerId: string
  canQuote: boolean
  canJob: boolean
  canSchedule: boolean
}) {
  const { setOpen } = useAddSite()

  const items: ActionMenuItem[] = []

  if (canQuote) {
    items.push({
      label: 'Quote',
      description: 'Quote builder, customer pre-filled',
      href: `/portal/employee/quotes-v2/new?customer=${customerId}`,
      icon: <FileText />,
    })
  }
  if (canJob) {
    items.push({
      label: 'Job',
      description: 'Installation or service work',
      href: `/portal/employee/jobs/new?customer=${customerId}`,
      icon: <Wrench />,
    })
  }
  items.push({
    label: 'Site',
    description: 'An existing system or extra location',
    onSelect: () => setOpen(true),
    icon: <MapPinPlus />,
  })
  if (canSchedule) {
    items.push({
      label: 'Appointment',
      description: 'Meeting, inspection or follow-up',
      href: `/portal/employee/calendar?customerId=${customerId}`,
      icon: <CalendarDays />,
    })
  }

  return <ActionMenu label="New" icon={<Plus className="h-3.5 w-3.5" />} items={items} />
}
