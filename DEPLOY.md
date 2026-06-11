# Deploying haberl-web

Recommended host: **Vercel** (Next.js-native, built-in cron, free hobby tier to start).
The repo is already prepared: `vercel.json` configures the daily quote-followups cron.

## 1. Create the Vercel project (~10 min)

1. Sign in at [vercel.com](https://vercel.com) with the GitHub account that owns `MatthewHaberl/Haberl-web`.
2. **Add New → Project** → import `Haberl-web`. Framework auto-detects as Next.js.
3. Before the first deploy, add the environment variables below (Settings → Environment Variables, scope: Production + Preview).

## 2. Environment variables

| Variable | Value / where to get it | Required |
|----------|------------------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (server-only — never expose) | ✅ |
| `NEXT_PUBLIC_APP_URL` | `https://haberl.co.za` (drives links in emails + public quote URLs) | ✅ |
| `RESEND_API_KEY` | resend.com → API Keys (verify the haberl.co.za domain first) | ✅ for emails |
| `CRON_SECRET` | any long random string — Vercel Cron sends it automatically as a Bearer token | ✅ for follow-ups |
| `GOOGLE_SOLAR_API_KEY` | Google Cloud console (server-only) | ✅ for roof designer |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Google Cloud console — restrict to haberl.co.za + vercel.app preview domain | ✅ for roof designer |
| `NOMINATIM_USER_AGENT` | `haberl-web/1.0 (matthew@haberl.co.za)` | ✅ |
| `MONITORING_CRON_SECRET` | existing value (VPS crontab for /api/monitoring/collect) | if monitoring used |
| `MONITORING_CREDENTIALS_KEY` | existing 64-hex value | if monitoring used |
| `ENABLE_AI_QUOTES` | leave unset — legacy AI quote endpoint stays disabled | optional |
| `ANTHROPIC_API_KEY` | only if `ENABLE_AI_QUOTES=true` | optional |
| PayFast vars | leave as sandbox until shop checkout ships | optional |

## 3. Domain

1. Vercel project → Settings → Domains → add `haberl.co.za` (+ `www.haberl.co.za`).
2. At the registrar, point DNS as Vercel instructs (A `76.76.21.21` / CNAME `cname.vercel-dns.com`).
3. SSL is automatic once DNS propagates.

## 4. Supabase production config (5 min)

1. Supabase → Authentication → URL Configuration:
   - Site URL: `https://haberl.co.za`
   - Redirect URLs: add `https://haberl.co.za/**`
2. Google Maps key restriction: add `haberl.co.za` (and the `*.vercel.app` preview URL if you want roof design on previews).
3. Run the security advisors (Supabase dashboard → Advisors) and review anything new.

## 5. Post-deploy smoke test

- [ ] `https://haberl.co.za/quote-request` — submit a test lead → appears under Quotes → Website Leads, email arrives
- [ ] Open a quote → **Email to customer** → email arrives, link opens the public quote page on your phone
- [ ] Accept the test quote → job auto-created → EFT details show (Settings → Company must have banking filled)
- [ ] Upload a proof of payment → admin email arrives → Confirm deposit advances the job
- [ ] Settings → Company: confirm banking + pricing values are what you expect
- [ ] Vercel → Cron: `quote-followups` listed and green after first run (07:00 SAST daily)
- [ ] Delete the test lead/quote/job afterwards

## Notes

- The cron route accepts Vercel's `Authorization: Bearer $CRON_SECRET` header **or**
  `?secret=` for VPS crontabs — both check the same secret.
- `/api/monitoring/collect` remains designed for a VPS crontab (60s budget). If monitoring
  should run from Vercel too, add a second cron entry the same way.
- Region: Vercel auto-selects; Supabase is EU-Central. If latency matters later, pin the
  Vercel function region to `fra1` (Frankfurt) in project settings to sit next to the DB.
