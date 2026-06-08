import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Supabase Storage
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      // Manufacturer CDNs for product images
      { protocol: 'https', hostname: 'www.victronenergy.com' },
      { protocol: 'https', hostname: 'www.sigenergy.com' },
      { protocol: 'https', hostname: 'www.sunsynk.org' },
      { protocol: 'https', hostname: 'www.sungrowpower.com' },
      { protocol: 'https', hostname: 'en.sungrowpower.com' },
      { protocol: 'https', hostname: 'www.deyeinverter.com' },
      { protocol: 'https', hostname: 'www.solisinverters.com' },
      { protocol: 'https', hostname: 'cmsdata.solisinverters.com' },
      { protocol: 'https', hostname: 'ja-solar.com' },
      { protocol: 'https', hostname: 'deyeinverter.com' },
      { protocol: 'https', hostname: 'www.luxpowertek.com' },
      { protocol: 'https', hostname: 'www.jasolar.com' },
      { protocol: 'https', hostname: 'longi.com' },
      { protocol: 'https', hostname: 'en.longi.com' },
      { protocol: 'https', hostname: 'www.trinasolar.com' },
      { protocol: 'https', hostname: 'en.aiko-solar.com' },
      { protocol: 'https', hostname: 'www.freedomwon.co.za' },
      { protocol: 'https', hostname: 'bslbatt.com' },
      { protocol: 'https', hostname: 'www.bslbatt.com' },
      { protocol: 'https', hostname: 'eenovance.com' },
      { protocol: 'https', hostname: 'www.eenovance.com' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
          { key: 'X-DNS-Prefetch-Control',    value: 'on' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
