'use client'

import { useState } from 'react'
import { FileText, BookOpen, Wrench, Ruler, Box, Cpu, Shield, Award, File, ExternalLink } from 'lucide-react'
import type { Product, EquipmentCatalogItem, ProductDocument, ProductDocType } from '@/types/database'

const categoryLabel: Record<string, string> = {
  inverter: 'Inverter',
  battery:  'Battery',
  panel:    'Solar Panel',
  other:    'Component',
}

interface Props {
  product: Product
  catalogItem: EquipmentCatalogItem | null
  productDocs: ProductDocument[]
}

const TABS = ['Overview', 'Specifications', 'Downloads'] as const
type Tab = typeof TABS[number]

const DOC_TYPE_ORDER: ProductDocType[] = [
  'datasheet', 'manual', 'installation_guide', 'wiring_diagram',
  'drawing', '3d_model', 'certification', 'warranty', 'other',
]

const DOC_TYPE_LABELS: Record<ProductDocType, string> = {
  datasheet:          'Datasheets',
  manual:             'Manuals',
  installation_guide: 'Installation Guides',
  drawing:            'Drawings',
  '3d_model':         '3D Models',
  wiring_diagram:     'Wiring Diagrams',
  warranty:           'Warranty',
  certification:      'Certifications',
  other:              'Other',
}

const DOC_TYPE_ICONS: Record<ProductDocType, React.ElementType> = {
  datasheet:          FileText,
  manual:             BookOpen,
  installation_guide: Wrench,
  drawing:            Ruler,
  '3d_model':         Box,
  wiring_diagram:     Cpu,
  warranty:           Shield,
  certification:      Award,
  other:              File,
}

const DOC_TYPE_COLORS: Record<ProductDocType, string> = {
  datasheet:          'bg-red-50 dark:bg-red-950/30 text-red-500',
  manual:             'bg-blue-50 dark:bg-blue-950/30 text-blue-500',
  installation_guide: 'bg-green-50 dark:bg-green-950/30 text-green-600',
  drawing:            'bg-purple-50 dark:bg-purple-950/30 text-purple-500',
  '3d_model':         'bg-gray-100 dark:bg-gray-800/50 text-gray-500',
  wiring_diagram:     'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600',
  warranty:           'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500',
  certification:      'bg-amber-50 dark:bg-amber-950/30 text-amber-600',
  other:              'bg-muted text-muted-foreground',
}

export function ProductTabs({ product, catalogItem, productDocs }: Props) {
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

  // Merge legacy datasheet_url into productDocs (won't duplicate if already present)
  const legacyUrl = catalogItem?.datasheet_url
  const hasLegacy = legacyUrl && !productDocs.some(d => d.url === legacyUrl)
  const allDocs: ProductDocument[] = hasLegacy
    ? [
        {
          id: '__legacy__',
          product_id: product.id,
          brand: product.brand ?? '',
          product_family: product.name,
          doc_type: 'datasheet',
          title: 'Product Datasheet',
          url: legacyUrl!,
          file_path: null, file_size_kb: null, language: 'en', version: null,
          status: 'published', notes: null, source: null,
          created_at: '', updated_at: '',
        } as ProductDocument,
        ...productDocs,
      ]
    : productDocs

  // Group by doc_type in defined order
  const byType: Partial<Record<ProductDocType, ProductDocument[]>> = {}
  for (const doc of allDocs) {
    if (!byType[doc.doc_type]) byType[doc.doc_type] = []
    byType[doc.doc_type]!.push(doc)
  }
  const docTypeGroups = DOC_TYPE_ORDER.filter(t => byType[t]?.length)

  const downloadCount = allDocs.length

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
            {t === 'Downloads' && downloadCount > 0 && (
              <span className="ml-1.5 bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {downloadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="py-6 px-5">
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
          <div className="max-w-xl">
            {docTypeGroups.length > 0 ? (
              <div className="flex flex-col gap-6">
                {docTypeGroups.map(type => {
                  const Icon = DOC_TYPE_ICONS[type]
                  const colorClass = DOC_TYPE_COLORS[type]
                  return (
                    <div key={type}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {DOC_TYPE_LABELS[type]}
                      </p>
                      <div className="flex flex-col gap-2">
                        {byType[type]!.map(doc => (
                          doc.url ? (
                            <a
                              key={doc.id}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted hover:border-accent/50 transition-colors group"
                            >
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground group-hover:text-primary transition-colors text-sm">
                                  {doc.title}
                                </p>
                                {doc.notes && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{doc.notes}</p>
                                )}
                              </div>
                              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            </a>
                          ) : (
                            <div
                              key={doc.id}
                              className="flex items-center gap-4 p-4 rounded-xl border border-border opacity-60"
                            >
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm">{doc.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Contact us to request this document</p>
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )
                })}

                <p className="text-xs text-muted-foreground border-t border-border pt-4">
                  Can&apos;t find what you need?{' '}
                  <a href="https://wa.me/27615193016" className="text-accent hover:underline">
                    WhatsApp us
                  </a>
                  {' '}and we&apos;ll send it directly.
                </p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No documents available yet.</p>
                <p className="text-xs mt-1">
                  <a href="https://wa.me/27615193016" className="text-accent hover:underline">
                    WhatsApp us
                  </a>
                  {' '}and we&apos;ll send datasheets directly.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
