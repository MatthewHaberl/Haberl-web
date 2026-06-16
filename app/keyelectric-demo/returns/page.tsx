import type { Metadata } from 'next'
import { InfoLayout } from '../_components/InfoLayout'

export const metadata: Metadata = { title: 'Returns / Exchange | Key Electric (demo)' }

export default function ReturnsPage() {
  return (
    <InfoLayout title="Returns / Exchange" subtitle="Our promise to make things right." trail={[{ label: 'Returns / Exchange' }]}>
      <div className="space-y-6 text-sm leading-relaxed text-[var(--ke-ink)]">
        <Section title="7-day returns">
          Unused items in their original, undamaged packaging may be returned within 7 days of delivery or collection. Please keep your
          invoice or order number as proof of purchase.
        </Section>
        <Section title="How to start a return">
          Email <a href="mailto:webstore@keyelectric.co.za" className="text-[var(--ke-yellow-dark)] underline">webstore@keyelectric.co.za</a> or
          message us on WhatsApp with your order number and the reason for the return. Our team will confirm the next steps and the return
          address.
        </Section>
        <Section title="Faulty or incorrect items">
          If an item arrives faulty or we sent the wrong product, we will arrange a replacement or full refund at no cost to you. Please
          report any issues within 48 hours of receiving your order.
        </Section>
        <Section title="Non-returnable items">
          Cut-to-length cable, custom orders and clearance items are non-returnable unless faulty. COC booklets cannot be returned once
          opened.
        </Section>
        <Section title="Refunds">
          Approved refunds are processed to your original payment method within 7–10 business days of us receiving the returned goods.
        </Section>
        <p className="rounded-md bg-[var(--ke-soft)] p-4 text-xs text-[var(--ke-muted)]">
          This is a sandbox demo of the Key Electric storefront — policy wording is illustrative only.
        </p>
      </div>
    </InfoLayout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-1.5 text-lg font-bold text-[var(--ke-slate)]">{title}</h2>
      <p className="text-[var(--ke-muted)]">{children}</p>
    </div>
  )
}
