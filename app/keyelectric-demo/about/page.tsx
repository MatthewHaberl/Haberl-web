import { Users, HeartHandshake, Leaf, Award } from 'lucide-react'
import type { Metadata } from 'next'
import { InfoLayout } from '../_components/InfoLayout'

export const metadata: Metadata = { title: 'About us | Key Electric (demo)' }

const BASE = '/keyelectric-demo'

const pillars = [
  { icon: Leaf, title: 'Building Genuine Connections', body: 'Eco-friendly practices and honest relationships with customers and suppliers alike.' },
  { icon: HeartHandshake, title: 'Family Values, Trusted Partners', body: 'A family-run business built on trust, collaboration and doing right by our customers.' },
  { icon: Award, title: 'A Community of Excellence', body: 'Committed to sustainable growth and raising the standard of electrical supply in SA.' },
]

export default function AboutPage() {
  return (
    <InfoLayout title="About Key Electric" subtitle="Your trusted electrical wholesaler, supplying quality components since 2019." trail={[{ label: 'About us' }]}>
      <div className="space-y-5 text-sm leading-relaxed text-[var(--ke-ink)]">
        <p>
          Key Electric Online is a family-run electrical supplies business based in Midrand, South Africa. What started as a casual
          conversation in a local pub grew into a thriving operation supplying electricians, contractors and installers across the country.
        </p>
        <p>
          The founders&rsquo; hands-on expertise and relentless customer focus shaped who we are. Despite the early challenges of the
          pandemic, we expanded in 2021 into a larger hub serving an ever-wider range of electrical needs — from cable and switchgear to
          alternative power solutions for a load-shedding world.
        </p>
        <p>
          Today we stock components across fourteen major categories and partner with more than seventy of the industry&rsquo;s most trusted
          brands. Whether you need a single bootlace ferrule or a full distribution board, our goal is the same: the right product, at the
          right price, ready when you need it.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {pillars.map((p) => (
          <div key={p.title} className="rounded-xl border border-[var(--ke-line)] bg-white p-5">
            <p.icon className="mb-3 h-8 w-8 text-[var(--ke-yellow-dark)]" />
            <h3 className="mb-1 font-bold text-[var(--ke-slate)]">{p.title}</h3>
            <p className="text-sm text-[var(--ke-muted)]">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-2 gap-4 rounded-xl bg-[var(--ke-slate)] p-6 text-center text-white sm:grid-cols-4">
        <Stat n="2019" l="Founded" />
        <Stat n="70+" l="Brands stocked" />
        <Stat n="14" l="Categories" />
        <Stat n="6 days" l="Open per week" />
      </div>
    </InfoLayout>
  )
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <p className="text-2xl font-extrabold text-[var(--ke-yellow)]">{n}</p>
      <p className="text-xs text-white/70">{l}</p>
    </div>
  )
}
