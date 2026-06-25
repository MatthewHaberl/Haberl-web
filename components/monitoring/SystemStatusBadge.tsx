'use client'

import type { DeviceState } from '@/lib/monitoring/types'

const config: Record<DeviceState, { label: string; dot: string; text: string }> = {
  online:  { label: 'Online',  dot: 'bg-success',          text: 'text-foreground'       },
  offline: { label: 'Offline', dot: 'bg-destructive',      text: 'text-foreground'       },
  fault:   { label: 'Fault',   dot: 'bg-destructive',      text: 'text-foreground'       },
  standby: { label: 'Standby', dot: 'bg-warning',          text: 'text-foreground'       },
  unknown: { label: 'Unknown', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
}

export function SystemStatusBadge({ state }: { state: DeviceState | null | undefined }) {
  const s = config[state ?? 'unknown']
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}
