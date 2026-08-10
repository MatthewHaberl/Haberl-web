# haberl-web

Next.js 16 web app for **Haberl Electrical & Solar** — the customer/employee
portal, solar quoting engine, shop, and inverter-monitoring platform that
replaces the WordPress site at haberl.co.za.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **DB / Auth / Storage:** Supabase (Postgres + RLS)
- **Styling:** Tailwind CSS v4 — brand colours are CSS vars in `app/globals.css` (no `tailwind.config.js`)
- **Payments:** PayFast (Phase 2)
- **Icons:** lucide-react

## Three audiences

| Role | Portal | Key pages |
|------|--------|-----------|
| customer | `/portal/customer` | sites, docs + service history, orders, monitoring |
| field_worker | `/portal/employee` | assigned jobs, job checklist |
| manager / admin | `/portal/employee` | jobs, customers, quotes, finance, monitoring, metrics |

## Getting started

Requires **Node.js ≥ 20** (use `nvm use 22` if on an older version).

```bash
cp .env.local.example .env.local   # then fill in Supabase + the other keys
npm install
npm run dev                         # http://localhost:3000
```

See **`.env.local.example`** for every environment variable and **`DEPLOY.md`**
for where each value comes from and how to deploy to Vercel.

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
npm test         # unit tests (node:test via tsx) — lib/**/__tests__/*.test.ts
```

## Layout

- `app/` — App Router pages, layouts, and API route handlers (`app/api/**`)
- `components/` — shared UI and feature components
- `lib/` — business logic: `solar/` (quoting/design), `monitoring/` (inverter adapters + alerts), `finance/`, `quotes/`, `email/`, `supabase/`, `auth/`
- `supabase/migrations/` — full schema + RLS policies (apply in order)
- `types/` — shared TypeScript types
- `proxy.ts` — Supabase session-refresh middleware + portal/auth route guards

## Notes

- `AGENTS.md` / `CLAUDE.md` hold project conventions — read them before making changes.
- Auth is enforced in three layers: `proxy.ts` (session + coarse redirects),
  the portal layouts (`requireSection`), and Supabase RLS. New tables must enable RLS.
