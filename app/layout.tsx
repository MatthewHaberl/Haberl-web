import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { WhatsAppFabGate } from '@/components/layout/WhatsAppFabGate'

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

const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <WhatsAppFabGate />
      </body>
    </html>
  )
}
