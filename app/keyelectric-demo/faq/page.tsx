import { ChevronDown } from 'lucide-react'
import type { Metadata } from 'next'
import { InfoLayout } from '../_components/InfoLayout'

export const metadata: Metadata = { title: 'FAQ | Key Electric (demo)' }

const faqs = [
  { q: 'Are your prices including or excluding VAT?', a: 'All prices on the store are shown excluding VAT for trade convenience. The VAT-inclusive price is shown on each product and in your cart, and 15% VAT is added at checkout.' },
  { q: 'Do you deliver nationwide?', a: 'Yes. We offer door-to-door delivery across South Africa. Delivery is calculated at checkout based on your location and order size. Collection from our Midrand branch is also available.' },
  { q: 'Can I open a trade / contractor account?', a: 'Absolutely. Registered electricians and contractors can apply for a trade account to unlock contractor pricing. Message us on WhatsApp or email webstore@keyelectric.co.za to get started.' },
  { q: 'What are your trading hours?', a: 'We are open Monday to Friday 6:30 AM – 5:00 PM and Saturday 7:00 AM – 12:00 PM. We are closed on Sundays and public holidays.' },
  { q: 'Do you stock COC booklets?', a: 'Yes — we carry Certificate of Compliance booklets for both ECA members and non-ECA members. You will find them under the COC Booklet category.' },
  { q: 'What is your returns policy?', a: 'Unused items in their original packaging can be returned within 7 days. See our Returns / Exchange page for full details.' },
  { q: 'How do I track my order?', a: 'Once your order ships you will receive tracking details by email. You can also view order status under My Account.' },
]

export default function FaqPage() {
  return (
    <InfoLayout title="Frequently Asked Questions" subtitle="Answers to the questions we hear most often." trail={[{ label: 'FAQ' }]}>
      <div className="space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="group rounded-lg border border-[var(--ke-line)] bg-white p-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-semibold text-[var(--ke-slate)]">
              {f.q}
              <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ke-muted)]">{f.a}</p>
          </details>
        ))}
      </div>
    </InfoLayout>
  )
}
