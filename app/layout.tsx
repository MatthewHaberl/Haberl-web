import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL('https://haberl.co.za'),
  title: { default: 'Haberl Electrical & Solar', template: '%s | Haberl' },
  description: 'Haberl — expert solar and electrical installation in Gauteng. Customer portal, shop, and field operations.',
  robots: { index: true, follow: true },
  openGraph: {
    siteName: 'Haberl',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
