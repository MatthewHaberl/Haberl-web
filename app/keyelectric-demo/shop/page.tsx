import { Breadcrumb } from '../_components/Breadcrumb'
import { ShopBrowser } from '../_components/ShopBrowser'
import { categoryBySlug } from '../_lib/data'

const BASE = '/keyelectric-demo'

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; brand?: string; q?: string; sale?: string }>
}) {
  const sp = await searchParams
  const cat = sp.category ?? ''
  const catName = cat ? categoryBySlug(cat)?.name : undefined
  // Remount the browser when the query params change so it picks up fresh state.
  const remountKey = `${cat}|${sp.brand ?? ''}|${sp.q ?? ''}|${sp.sale ?? ''}`

  return (
    <div>
      <Breadcrumb
        trail={[
          { label: 'Shop', href: `${BASE}/shop` },
          ...(catName ? [{ label: catName }] : []),
        ]}
      />
      <ShopBrowser
        key={remountKey}
        initialCategory={cat}
        initialBrand={sp.brand ?? ''}
        initialQuery={sp.q ?? ''}
        initialSale={sp.sale === '1'}
      />
    </div>
  )
}
