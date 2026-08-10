import type { MetadataRoute } from 'next'

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://haberl.co.za').replace(/\/$/, '')

/**
 * Crawler rules for the public marketing site. Private surfaces (portal, API,
 * auth, and the tokenised public quote pages) are disallowed; the quote pages
 * already set `noindex` too, so this is defence in depth.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/portal/', '/api/', '/auth/', '/q/'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
