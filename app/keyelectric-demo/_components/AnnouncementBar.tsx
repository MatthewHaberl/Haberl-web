import Link from 'next/link'
import { Phone, Clock, MessageCircle, FlaskConical, ArrowLeft } from 'lucide-react'

export function AnnouncementBar() {
  return (
    <div className="w-full bg-[var(--ke-slate)] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <a href="tel:+27113154826" className="flex items-center gap-1.5 hover:text-[var(--ke-yellow)]">
            <Phone className="h-3.5 w-3.5" /> (011) 315 4826
          </a>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Clock className="h-3.5 w-3.5" /> Mon–Fri 6:30–17:00 · Sat 7:00–12:00
          </span>
        </div>
        <div className="flex items-center gap-x-4">
          <Link href="/portal/employee" className="flex items-center gap-1.5 font-semibold hover:text-[var(--ke-yellow)]">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Haberl portal
          </Link>
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--ke-yellow)]/15 px-2 py-0.5 font-semibold text-[var(--ke-yellow)]">
            <FlaskConical className="h-3.5 w-3.5" /> Sandbox demo — clone of keyelectric.co.za
          </span>
          <a
            href="https://wa.me/27113154826"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-[var(--ke-yellow)]"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Join WhatsApp Channel
          </a>
        </div>
      </div>
    </div>
  )
}
