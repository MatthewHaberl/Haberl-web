'use client'

import { useState } from 'react'
import { FileText, ExternalLink } from 'lucide-react'
import type { Product, EquipmentCatalogItem } from '@/types/database'

const categoryLabel: Record<string, string> = {
  inverter: 'Inverter',
  battery:  'Battery',
  panel:    'Solar Panel',
  other:    'Component',
}

interface Props {
  product: Product
  catalogItem: EquipmentCatalogItem | null
}

const TABS = ['Overview', 'Specifications', 'Downloads'] as const
type Tab = typeof TABS[number]

export function ProductTabs({ product, catalogItem }: Props) {
  const [tab, setTab] = useState<Tab>('Overview')

  const specs = [
    { label: 'Category',             value: product.category ? (categoryLabel[product.category] ?? product.category) : null },
    { label: 'Brand',                value: product.brand },
    { label: 'SKU',                  value: product.sku },
    { label: 'AC Output Power',      value: product.watts_ac ? `${(product.watts_ac / 1000).toFixed(1)} kW` : null },
    { label: 'DC Input Power',       value: product.watts_dc ? `${product.watts_dc} W` : null },
    { label: 'Battery Capacity',     value: product.kwh ? `${product.kwh} kWh` : null },
    { label: 'Weight',               value: product.weight_kg ? `${product.weight_kg} kg` : null },
    { label: 'Phase',                value: catalogItem?.phase && catalogItem.phase !== 'any' ? `${catalogItem.phase}-phase` : null },
    { label: 'Max Solar Current',    value: catalogItem?.isc_amps ? `${catalogItem.isc_amps} A` : null },
    { label: 'Open-Circuit Voltage', value: catalogItem?.voc_volts ? `${catalogItem.voc_volts} V` : null },
  ].filter(r => r.value != null) as { label: string; value: string }[]

  const downloads = [
    catalogItem?.datasheet_url ? { label: 'Product Datasheet', description: 'Technical specifications & wiring diagrams', url: catalogItem.datasheet_url } : null,
  ].filter(Boolean) as { label: string; description: string; url: string }[]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
            {t === 'Downloads' && downloads.length > 0 && (
              <span className="ml-1.5 bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {downloads.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="py-6">
        {tab === 'Overview' && (
          <div className="max-w-prose">
            {product.description ? (
              <p className="text-muted-foreground leading-relaxed">{product.description}</p>
            ) : catalogItem?.shop_description ? (
              <p className="text-muted-foreground leading-relaxed">{catalogItem.shop_description}</p>
            ) : (
              <p className="text-muted-foreground italic text-sm">
                No description available yet. Contact us for more information about this product.
              </p>
            )}
            {catalogItem?.notes && (
              <div className="mt-4 p-4 bg-muted rounded-xl text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Notes</p>
                <p>{catalogItem.notes}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'Specifications' && (
          specs.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border max-w-lg">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {specs.map(row => (
                    <tr key={row.label} className="even:bg-muted/40">
                      <td className="px-4 py-2.5 font-medium text-foreground/60 w-48">{row.label}</td>
                      <td className="px-4 py-2.5 text-foreground font-mono">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground italic text-sm">No specifications available yet.</p>
          )
        )}

        {tab === 'Downloads' && (
          <div className="space-y-3 max-w-lg">
            {downloads.length > 0 ? downloads.map(doc => (
              <a
                key={doc.url}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted transition-colors group"
              >
                <div className="h-10 w-10 bg-red-50 dark:bg-red-950/30 rounded-lg flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground group-hover:text-primary transition-colors">{doc.label}</p>
                  <p className="text-xs text-muted-foreground">{doc.description}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </a>
            )) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No downloads available yet.</p>
                <p className="text-xs mt-1">Contact us and we&apos;ll send datasheets directly.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
