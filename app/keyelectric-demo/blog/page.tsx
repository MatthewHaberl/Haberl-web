import Link from 'next/link'
import { CalendarDays, ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import { InfoLayout } from '../_components/InfoLayout'

export const metadata: Metadata = { title: 'Blog | Key Electric (demo)' }

const BASE = '/keyelectric-demo'

const posts = [
  { title: 'Choosing the right solar cable for your install', date: '12 May 2026', tag: 'Solar', excerpt: 'TUV ratings, current capacity and why tinned copper matters for rooftop PV runs.' },
  { title: 'Earth leakage vs circuit breakers: what protects what', date: '28 Apr 2026', tag: 'Switchgear', excerpt: 'A plain-English guide to the protection devices in every distribution board.' },
  { title: 'Back-up power buyer’s guide for load-shedding', date: '15 Apr 2026', tag: 'Alt Power', excerpt: 'Sizing inverters and batteries so you keep the lights on without overspending.' },
  { title: 'COC booklets: ECA vs non-ECA explained', date: '2 Apr 2026', tag: 'Compliance', excerpt: 'Which Certificate of Compliance booklet you need and how to complete one correctly.' },
]

export default function BlogPage() {
  return (
    <InfoLayout title="Blog & Guides" subtitle="Practical advice from the Key Electric team." trail={[{ label: 'Blog' }]} wide>
      <div className="grid gap-5 sm:grid-cols-2">
        {posts.map((p) => (
          <article key={p.title} className="flex flex-col rounded-xl border border-[var(--ke-line)] bg-white p-5">
            <span className="mb-2 w-fit rounded-full bg-[var(--ke-yellow)]/15 px-2.5 py-0.5 text-xs font-bold text-[var(--ke-yellow-dark)]">{p.tag}</span>
            <h2 className="text-lg font-bold text-[var(--ke-slate)]">{p.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ke-muted)]"><CalendarDays className="h-3.5 w-3.5" /> {p.date}</p>
            <p className="mt-3 flex-1 text-sm text-[var(--ke-muted)]">{p.excerpt}</p>
            <span className="mt-4 flex items-center gap-1 text-sm font-semibold text-[var(--ke-yellow-dark)]">Read more <ArrowRight className="h-4 w-4" /></span>
          </article>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-[var(--ke-muted)]">
        This is a demo blog. <Link href={`${BASE}/shop`} className="font-semibold text-[var(--ke-yellow-dark)] underline">Browse the shop</Link> to see the storefront in action.
      </p>
    </InfoLayout>
  )
}
