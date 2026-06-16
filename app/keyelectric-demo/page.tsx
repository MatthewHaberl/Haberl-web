import Link from 'next/link'
import { Truck, BadgeCheck, Clock, FileCheck, ArrowRight, MessageCircle } from 'lucide-react'
import { categories, featuredProducts, brands, categoryBySlug } from './_lib/data'
import { ProductCard } from './_components/ProductCard'
import { StoreImage } from './_components/StoreImage'

const BASE = '/keyelectric-demo'

const trust = [
  { icon: Truck, title: 'Nationwide Delivery', sub: 'Door-to-door across SA' },
  { icon: BadgeCheck, title: 'Trade Accounts', sub: 'Contractor pricing available' },
  { icon: Clock, title: 'Open 6 Days', sub: 'Mon–Sat, collect or deliver' },
  { icon: FileCheck, title: 'COC Booklets', sub: 'In stock for ECA & non-ECA' },
]

export default function KeHomePage() {
  const altPower = categoryBySlug('alternative-power-solutions')
  const cable = categoryBySlug('cable')
  const switchgear = categoryBySlug('switchgear')

  return (
    <div>
      {/* ── Hero / promos ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pt-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Big promo */}
          <Link
            href={`${BASE}/shop?category=alternative-power-solutions`}
            className="group relative flex min-h-[260px] flex-col justify-center overflow-hidden rounded-xl bg-[var(--ke-slate)] p-8 text-white lg:col-span-2"
          >
            <span className="mb-2 inline-block w-fit rounded-full bg-[var(--ke-yellow)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--ke-slate)]">On Sale</span>
            <h1 className="max-w-md text-3xl font-extrabold leading-tight md:text-4xl">Alternative Power Solutions</h1>
            <p className="mt-2 max-w-md text-white/70">Inverters, batteries, solar mounting & EV charging — built for South African load-shedding.</p>
            <span className="mt-5 inline-flex w-fit items-center gap-2 font-semibold text-[var(--ke-yellow)]">Shop now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            {altPower && (
              <div className="pointer-events-none absolute -right-6 bottom-0 h-48 w-48 opacity-90 md:h-60 md:w-60">
                <StoreImage src={altPower.image} alt="" className="object-contain" />
              </div>
            )}
          </Link>

          {/* Two small promos */}
          <div className="grid gap-4">
            <Link href={`${BASE}/shop?category=switchgear`} className="group relative flex flex-1 items-center overflow-hidden rounded-xl bg-[var(--ke-yellow)] p-6 text-[var(--ke-slate)]">
              <div className="relative z-10">
                <p className="text-xs font-bold uppercase tracking-wide">Big Deals</p>
                <h2 className="text-xl font-extrabold leading-tight">Switchgear & Breakers</h2>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">Shop <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
              </div>
              {switchgear && (
                <div className="pointer-events-none absolute -right-2 bottom-0 h-28 w-28 opacity-90">
                  <StoreImage src={switchgear.image} alt="" className="object-contain" />
                </div>
              )}
            </Link>
            <Link href={`${BASE}/shop?category=cable`} className="group relative flex flex-1 items-center overflow-hidden rounded-xl border-2 border-[var(--ke-yellow)] bg-white p-6 text-[var(--ke-slate)]">
              <div className="relative z-10">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--ke-yellow-dark)]">Price Cut</p>
                <h2 className="text-xl font-extrabold leading-tight">Cable & Wire</h2>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold">Shop <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
              </div>
              {cable && (
                <div className="pointer-events-none absolute -right-2 bottom-0 h-28 w-28 opacity-90">
                  <StoreImage src={cable.image} alt="" className="object-contain" />
                </div>
              )}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {trust.map((t) => (
            <div key={t.title} className="flex items-center gap-3 rounded-lg border border-[var(--ke-line)] bg-white p-4">
              <t.icon className="h-7 w-7 shrink-0 text-[var(--ke-yellow-dark)]" />
              <div>
                <p className="text-sm font-bold text-[var(--ke-slate)]">{t.title}</p>
                <p className="text-xs text-[var(--ke-muted)]">{t.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Shop by category ──────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-4">
        <SectionHeading title="Shop by Category" href={`${BASE}/shop`} linkText="View all" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`${BASE}/shop?category=${c.slug}`}
              className="group flex flex-col items-center gap-2 rounded-lg border border-[var(--ke-line)] bg-white p-3 text-center transition-shadow hover:shadow-md"
            >
              <div className="h-20 w-20">
                <StoreImage src={c.image} alt={c.name} className="object-contain" />
              </div>
              <span className="text-xs font-semibold leading-tight text-[var(--ke-slate)] group-hover:text-[var(--ke-yellow-dark)]">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── In-Store Specials ─────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-6">
        <SectionHeading title="In-Store Specials" href={`${BASE}/shop?sale=1`} linkText="All specials" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {featuredProducts.map((p) => (
            <ProductCard key={p.sku} product={p} />
          ))}
        </div>
      </section>

      {/* ── Back-up power CTA band ────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex flex-col items-center justify-between gap-4 rounded-xl bg-[var(--ke-slate)] px-8 py-8 text-white md:flex-row">
          <div>
            <h3 className="text-2xl font-extrabold">Beat load-shedding.</h3>
            <p className="text-white/70">Full back-up power range — inverters, batteries & solar mounting in stock.</p>
          </div>
          <Link href={`${BASE}/shop?category=alternative-power-solutions`} className="rounded-md bg-[var(--ke-yellow)] px-6 py-3 font-bold text-[var(--ke-slate)] hover:bg-[var(--ke-yellow-dark)]">
            Shop Back-up Power
          </Link>
        </div>
      </section>

      {/* ── Brands marquee ────────────────────────────────────────── */}
      <section className="py-8">
        <h2 className="mb-4 text-center text-sm font-bold uppercase tracking-widest text-[var(--ke-muted)]">Trusted Brands We Stock</h2>
        <div className="overflow-hidden">
          <div className="ke-marquee gap-3 px-2">
            {[...brands, ...brands].map((b, i) => (
              <span key={`${b}-${i}`} className="flex h-12 shrink-0 items-center rounded-lg border border-[var(--ke-line)] bg-white px-6 text-sm font-bold text-[var(--ke-slate)]">
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── WhatsApp band ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-4">
        <a
          href="https://wa.me/27113154826"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-between gap-4 rounded-xl bg-[#25D366] px-8 py-6 text-white md:flex-row"
        >
          <div className="flex items-center gap-3">
            <MessageCircle className="h-9 w-9" />
            <div>
              <p className="text-lg font-extrabold">Join our WhatsApp Channel</p>
              <p className="text-white/85">Be first to hear about specials, new stock & price cuts.</p>
            </div>
          </div>
          <span className="rounded-md bg-white px-6 py-3 font-bold text-[#128C7E]">Join now</span>
        </a>
      </section>
    </div>
  )
}

function SectionHeading({ title, href, linkText }: { title: string; href: string; linkText: string }) {
  return (
    <div className="mb-4 flex items-end justify-between border-b-2 border-[var(--ke-yellow)] pb-2">
      <h2 className="text-xl font-extrabold text-[var(--ke-slate)] md:text-2xl">{title}</h2>
      <Link href={href} className="flex items-center gap-1 text-sm font-semibold text-[var(--ke-yellow-dark)] hover:underline">
        {linkText} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
