'use client'

import { usePathname } from 'next/navigation'
import { WhatsAppFab } from './WhatsAppButton'

/**
 * Renders the WhatsApp "Chat with us" FAB everywhere EXCEPT staff portal pages
 * (/portal/employee/*), where it overlapped the floating BOM button. Customers
 * and public visitors still get it; staff don't.
 */
export function WhatsAppFabGate() {
  const pathname = usePathname()
  if (pathname?.startsWith('/portal/employee')) return null
  return <WhatsAppFab />
}
