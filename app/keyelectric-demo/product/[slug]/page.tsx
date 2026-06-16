import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Truck, RotateCcw, ShieldCheck, Check, MessageCircle } from 'lucide-react'
import type { Metadata } from 'next'
import { productBySlug, productsByCategory, categoryBySlug, keImg } from '../../_lib/data'
import { formatZAR, inclVat } from '../../_lib/format'
import { Breadcrumb } from '../../_components/Breadcrumb'
import { StoreImage } from '../../_components/StoreImage'
import { AddToCart } from '../../_components/AddToCart'
import { ProductCard } from '../../_components/ProductCard'

const BASE = '/keyelectric-demo'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const product = productBySlug(slug)
  return { title: product ? `${product.name} | Key Electric (demo)` : 'Product (demo)' }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = productBySlug(slug)
  if (!product) notFound()

  const category = categoryBySlug(product.categorySlug)
  const related = productsByCategory(product.categorySlug).filter((p) => p.slug !== product.slug).slice(0, 4)
  const src = product.img ? keImg(product.img) : ''

  return (
    <div>
      <Breadcrumb
        trail={[
          { label: 'Shop', href: `${BASE}/shop` },
          ...(category ? [{ label: category.name, href: `${BASE}/shop?category=${category.slug}` }] : []),
          { label: product.name },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 pb-12">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Image */}
          <div className="relative h-80 overflow-hidden rounded-xl border border-[var(--ke-line)] bg-white lg:h-[460px]">
            {product.onSale && (
              <span className="absolute left-3 top-3 z-10 rounded bg-red-600 px-2.5 py-1 text-xs font-bold uppercase text-white">Sale</span>
            )}
            <StoreImage src={src} alt={product.name} className="object-contain p-8" />
          </div>

          {/* Info */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {product.brand && <span className="rounded bg-[var(--ke-soft)] px-2 py-1 text-xs font-semibold text-[var(--ke-slate)]">{product.brand}</span>}
              {category && <Link href={`${BASE}/shop?category=${category.slug}`} className="rounded bg-[var(--ke-soft)] px-2 py-1 text-xs font-semibold text-[var(--ke-slate)] hover:text-[var(--ke-yellow-dark)]">{category.name}</Link>}
            </div>

            <div>
              <h1 className="text-2xl font-extrabold leading-snug text-[var(--ke-slate)] lg:text-3xl">{product.name}</h1>
              <p className="mt-1 font-mono text-sm text-[var(--ke-muted)]">SKU: {product.sku}</p>
            </div>

            {/* Price */}
            <div className="rounded-lg bg-[var(--ke-soft)] p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-[var(--ke-slate)]">{formatZAR(product.priceCents)}</span>
                <span className="text-sm font-semibold uppercase text-[var(--ke-muted)]">ex VAT</span>
                {product.compareCents && product.compareCents > product.priceCents && (
                  <span className="text-lg text-[var(--ke-muted)] line-through">{formatZAR(product.compareCents)}</span>
                )}
              </div>
              <p className="text-sm text-[var(--ke-muted)]">{formatZAR(inclVat(product.priceCents))} incl. VAT</p>
            </div>

            <p className="flex items-center gap-2 text-sm font-medium text-green-600">
              <Check className="h-4 w-4" /> In stock — dispatched from our Midrand warehouse
            </p>

            <AddToCart product={product} />

            <a href="https://wa.me/27113154826" target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-1.5 text-sm font-semibold text-[#128C7E] hover:underline">
              <MessageCircle className="h-4 w-4" /> Ask about bulk / trade pricing on WhatsApp
            </a>

            {/* Trust */}
            <div className="grid grid-cols-3 gap-2 border-t border-[var(--ke-line)] pt-4 text-center text-xs text-[var(--ke-muted)]">
              <div className="flex flex-col items-center gap-1"><Truck className="h-5 w-5 text-[var(--ke-yellow-dark)]" /> Nationwide delivery</div>
              <div className="flex flex-col items-center gap-1"><RotateCcw className="h-5 w-5 text-[var(--ke-yellow-dark)]" /> Easy returns</div>
              <div className="flex flex-col items-center gap-1"><ShieldCheck className="h-5 w-5 text-[var(--ke-yellow-dark)]" /> Genuine stock</div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-3 border-b-2 border-[var(--ke-yellow)] pb-1.5 text-lg font-bold text-[var(--ke-slate)]">Description</h2>
            <div className="space-y-3 text-sm leading-relaxed text-[var(--ke-ink)]">
              <p>
                The {product.name}{product.brand ? ` from ${product.brand}` : ''} is a quality electrical component stocked by Key Electric
                {category ? ` in our ${category.name} range` : ''}. Ideal for electricians, contractors and installers who need reliable
                product backed by genuine supply.
              </p>
              <p>
                All pricing is shown excluding VAT for trade convenience. Bulk and contractor pricing is available on request — message us
                on WhatsApp or open a trade account for your best rate.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 border-b-2 border-[var(--ke-yellow)] pb-1.5 text-lg font-bold text-[var(--ke-slate)]">Specifications</h2>
            <dl className="divide-y divide-[var(--ke-line)] text-sm">
              <Spec k="SKU" v={product.sku} />
              {product.brand && <Spec k="Brand" v={product.brand} />}
              {category && <Spec k="Category" v={category.name} />}
              <Spec k="Price (ex VAT)" v={formatZAR(product.priceCents)} />
              <Spec k="Price (incl VAT)" v={formatZAR(inclVat(product.priceCents))} />
              <Spec k="Availability" v="In stock" />
            </dl>
          </section>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 border-b-2 border-[var(--ke-yellow)] pb-2 text-xl font-extrabold text-[var(--ke-slate)]">Related Products</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.sku} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-2">
      <dt className="text-[var(--ke-muted)]">{k}</dt>
      <dd className="font-medium text-[var(--ke-slate)]">{v}</dd>
    </div>
  )
}
