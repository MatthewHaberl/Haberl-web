import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Zap, Sun, Shield, Phone, ChevronRight, Star } from 'lucide-react'

const services = [
  { icon: Zap,    title: 'Electrical Installations',  desc: 'Residential and commercial wiring, DB boards, COC compliance.' },
  { icon: Sun,    title: 'Solar Systems',              desc: 'On-grid, off-grid, and hybrid solar solutions. Full system design and installation.' },
  { icon: Shield, title: 'Compliance & Maintenance',  desc: 'SANS 10142 compliant certificates of compliance, inspections, and ongoing maintenance.' },
]

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-primary text-white py-24 px-4">
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm mb-6">
              <Star className="h-4 w-4 text-accent" />
              Trusted electrical and solar contractors — Gauteng
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Power your home.<br />
              <span className="text-accent">Secure your future.</span>
            </h1>
            <p className="text-lg text-white/80 max-w-2xl mx-auto mb-8">
              Expert electrical installations and solar solutions backed by a dedicated customer portal
              — track your system, access documents, and manage everything in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="accent" size="lg" asChild>
                <Link href="/auth/register">
                  Create your portal <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="text-white border-white/30 hover:bg-white/10" asChild>
                <Link href="/shop">Browse the shop</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="py-20 px-4 bg-muted">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-primary mb-3">What we do</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                From a single light point to a full off-grid solar system — Haberl handles it all.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-6">
              {services.map(({ icon: Icon, title, desc }) => (
                <Card key={title} className="text-center">
                  <CardContent className="pt-8 pb-6">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 mb-4">
                      <Icon className="h-7 w-7 text-accent" />
                    </div>
                    <h3 className="font-semibold text-primary mb-2">{title}</h3>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Portal CTA */}
        <section className="py-20 px-4">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl bg-primary p-8 sm:p-12 text-white text-center">
              <h2 className="text-3xl font-bold mb-3">Already a customer?</h2>
              <p className="text-white/80 mb-8 max-w-xl mx-auto">
                Log in to your portal to view your installation details, download compliance documents,
                check your warranty, and manage service history.
              </p>
              <Button variant="accent" size="lg" asChild>
                <Link href="/auth/login">Access your portal</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="py-20 px-4 bg-muted">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-primary mb-3">Get in touch</h2>
            <p className="text-muted-foreground mb-8">Ready for a quote? Have a question?</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <a href="tel:+27000000000"><Phone className="h-4 w-4" /> Call us</a>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="mailto:info@haberl.co.za">Email us</a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 px-4 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Haberl Electrical &amp; Solar. All rights reserved.
      </footer>
    </>
  )
}
