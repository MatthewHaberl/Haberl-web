import type { MetadataRoute } from 'next'

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'https://haberl.co.za').replace(/\/$/, '')

/**
 * Public, indexable marketing pages. Portal, auth, API and tokenised quote pages
 * are intentionally excluded (see robots.ts). Product detail pages are dynamic
 * and can be added here later from the catalog if SEO for individual products
 * becomes a priority.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/shop`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/quote-request`, changeFrequency: 'monthly', priority: 0.7 },
  ]
}
