'use client'

import type { DeviceState } from '@/lib/monitoring/types'

const config: Record<DeviceState, { label: string; dot: string; text: string }> = {
  online:  { label: 'Online',  dot: 'bg-green-500',  text: 'text-green-700'  },
  offline: { label: 'Offline', dot: 'bg-red-500',    text: 'text-red-700'    },
  fault:   { label: 'Fault',   dot: 'bg-red-600',    text: 'text-red-700'    },
  standby: { label: 'Standby', dot: 'bg-yellow-400', text: 'text-yellow-700' },
  unknown: { label: 'Unknown', dot: 'bg-gray-400',   text: 'text-gray-600'   },
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
