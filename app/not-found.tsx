import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-24 px-4">
        <div className="text-center">
          <p className="text-7xl font-bold text-accent mb-2">404</p>
          <h1 className="text-2xl font-bold text-primary mb-3">Page not found</h1>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/portal">Go to portal</Link>
            </Button>
          </div>
        </div>
      </main>
    </>
  )
}
