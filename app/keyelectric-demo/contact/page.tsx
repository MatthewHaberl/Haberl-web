import { Phone, Mail, MapPin, Clock, MessageCircle, type LucideIcon } from 'lucide-react'
import type { Metadata } from 'next'
import { InfoLayout } from '../_components/InfoLayout'
import { ContactForm } from '../_components/ContactForm'

export const metadata: Metadata = { title: 'Contact | Key Electric (demo)' }

export default function ContactPage() {
  return (
    <InfoLayout
      title="Contact Us"
      subtitle="Didn't find what you were looking for in our online store? We'd be happy to assist."
      trail={[{ label: 'Contact' }]}
      wide
    >
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Details */}
        <div className="space-y-6">
          <div className="space-y-4">
            <Detail icon={MapPin} title="Visit us">The Link, 676 Gallagher Ave, Halfway House, Midrand, 1685</Detail>
            <Detail icon={Phone} title="Call us"><a href="tel:+27113154826" className="hover:text-[var(--ke-yellow-dark)]">(011) 315 4826</a></Detail>
            <Detail icon={Mail} title="Email us"><a href="mailto:webstore@keyelectric.co.za" className="hover:text-[var(--ke-yellow-dark)]">webstore@keyelectric.co.za</a></Detail>
            <Detail icon={Clock} title="Trading hours">
              Monday – Friday: 6:30 AM – 5:00 PM<br />
              Saturday: 7:00 AM – 12:00 PM<br />
              Sunday: Closed
            </Detail>
            <Detail icon={MessageCircle} title="WhatsApp">
              <a href="https://wa.me/27113154826" target="_blank" rel="noopener noreferrer" className="text-[#128C7E] hover:underline">Message us on WhatsApp</a>
            </Detail>
          </div>

          {/* Map placeholder */}
          <div className="flex h-56 items-center justify-center rounded-xl border border-[var(--ke-line)] bg-[var(--ke-soft)] text-center text-sm text-[var(--ke-muted)]">
            <span className="flex flex-col items-center gap-2">
              <MapPin className="h-8 w-8 text-[var(--ke-yellow-dark)]" />
              Google Map — 676 Gallagher Ave, Midrand
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-[var(--ke-line)] bg-white p-6">
          <h2 className="mb-4 text-lg font-bold text-[var(--ke-slate)]">Send us a message</h2>
          <ContactForm />
        </div>
      </div>
    </InfoLayout>
  )
}

function Detail({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--ke-yellow-dark)]" />
      <div>
        <p className="font-bold text-[var(--ke-slate)]">{title}</p>
        <p className="text-sm text-[var(--ke-ink)]">{children}</p>
      </div>
    </div>
  )
}
