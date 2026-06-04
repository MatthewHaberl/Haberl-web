@AGENTS.md

# haberl-web — Project Instructions

Next.js 16 web app for Haberl Electrical & Solar. Replaces WordPress at haberl.co.za.

## Stack
- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **DB / Auth / Storage:** Supabase
- **Styling:** Tailwind CSS v4 — brand colors are CSS vars in `app/globals.css`, NO tailwind.config.js
- **Payments:** PayFast (SA) via `@payfast/core`
- **Icons:** lucide-react

## Three audiences
| Role | Portal | Key pages |
|------|--------|-----------|
| customer | `/portal/customer` | sites, site detail (docs + service history), orders |
| field_worker | `/portal/employee` | jobs (my assigned), job detail (checklist) |
| manager / admin | `/portal/employee` | all jobs, customers, metrics |

## Key files
- `app/globals.css` — brand color tokens (change here to rebrand the whole site)
- `app/portal/layout.tsx` — auth guard on `/portal/*`, redirects to `/auth/login`; also role-routes `/portal` → customer or employee dashboard
- `lib/supabase/client.ts` — browser Supabase client
- `lib/supabase/server.ts` — server component Supabase client
- `types/database.ts` — TypeScript types for all DB tables
- `supabase/migrations/001_init.sql` — full schema + RLS policies
- `supabase/seed.sql` — sample products for dev

## Env vars
Copy `.env.local.example` → `.env.local` and fill in Supabase + PayFast keys before `npm run dev`.

## Running
Requires Node.js >=20. Run `nvm use 22.22.3` first if on an older version.
```
npm install
npm run dev     # http://localhost:3000
```

## Build phases
- Phase 1 (done): scaffold, auth, customer portal, employee portal, DB schema
- Phase 2: shop (product grid, cart, PayFast checkout)
- Phase 3: PWA (next-pwa), push notifications
- Phase 4: Google Tag Manager + Meta Pixel + TikTok Pixel
- Phase 5: Meta Graph API social management panel
