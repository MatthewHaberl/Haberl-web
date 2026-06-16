import type { Metadata } from 'next'
import { InfoLayout } from '../_components/InfoLayout'

export const metadata: Metadata = { title: 'Terms & Conditions | Key Electric (demo)' }

const sections = [
  { title: '1. General', body: 'These terms govern your use of the Key Electric online store and the purchase of products from us. By placing an order you agree to these terms.' },
  { title: '2. Pricing & VAT', body: 'Prices are displayed excluding VAT unless otherwise stated. 15% VAT is added at checkout. Prices are subject to change without notice and stock availability.' },
  { title: '3. Orders & payment', body: 'An order is confirmed once payment is received and verified. We reserve the right to cancel any order due to pricing errors, stock shortages or suspected fraud.' },
  { title: '4. Delivery', body: 'Delivery timeframes are estimates and not guaranteed. Risk in the goods passes to you on delivery or collection. Delivery fees are calculated at checkout.' },
  { title: '5. Warranties', body: 'Products carry the manufacturer’s warranty where applicable. Key Electric is not liable for incorrect installation or use of products outside their rated specifications.' },
  { title: '6. Returns', body: 'Returns are handled per our Returns / Exchange policy. Please review it before requesting a return.' },
  { title: '7. Limitation of liability', body: 'To the extent permitted by law, Key Electric’s liability is limited to the value of the goods purchased.' },
]

export default function TermsPage() {
  return (
    <InfoLayout title="Terms & Conditions" trail={[{ label: 'Terms and Conditions' }]}>
      <div className="space-y-5 text-sm leading-relaxed">
        {sections.map((s) => (
          <div key={s.title}>
            <h2 className="mb-1 font-bold text-[var(--ke-slate)]">{s.title}</h2>
            <p className="text-[var(--ke-muted)]">{s.body}</p>
          </div>
        ))}
        <p className="rounded-md bg-[var(--ke-soft)] p-4 text-xs text-[var(--ke-muted)]">
          This is a sandbox demo of the Key Electric storefront built by Haberl for demonstration purposes. The wording above is illustrative
          and not the live store&rsquo;s legal terms.
        </p>
      </div>
    </InfoLayout>
  )
}
