# ComplianceOS — Monthly Running Costs

What it costs to run ComplianceOS **live** on the current stack (Vercel + Supabase + Resend),
and what you'd set up for each. Prices are USD/month, as of this writing.

## The bill

| Service | What it's for | Plan | $/mo | Required? | You need to |
|---|---|---|---:|---|---|
| **Vercel** | Hosts the app + runs the cron jobs (jobs worker every minute, daily digest) | Pro | **$20** | ✅ Yes | Connect the repo, set env vars, upgrade to Pro (Hobby caps cron at once/day + is non-commercial) |
| **Supabase** | Database + auth + file storage | Pro | **$25** | ✅ Yes for live | Upgrade the existing project (Free tier *pauses* after inactivity + no backups) |
| **Resend** | Sends the daily digest email | Free | **$0** | ✅ (free tier is enough) | Verify a sending **domain** (add SPF + DKIM DNS records), give me the API key |
| **Domain** | Email sending domain + your app's URL | — | **~$1** | ✅ Yes | Own a domain (~$12/yr); you may already have one |
| **Render** | Runs the PDF (LaTeX) renderer | Starter | **~$7** | ⬜ Optional | Only if you want to avoid PDF cold-starts; the free tier works with a ~30s first-load delay |

## Total

- **Live, recommended:** **≈ $45–53 / month** (Vercel $20 + Supabase $25 + Domain ~$1 + Render $7, with Resend free)
- **Testing only:** **≈ $0–12 / month** — you *can* run on all free tiers (Vercel Hobby, Supabase Free, Resend Free, Render Free) plus the domain, but with caveats: Supabase pauses when idle, cron is limited to once/day, and PDFs cold-start. Fine for trying it out, not for real users.

## Notes

- **Resend free tier** = 3,000 emails/month (100/day) — plenty for a daily digest to a small team. If volume grows, Resend Pro is $20/mo for 50k emails.
- **Secrets** I'll need from you when you're ready (never committed — they go in `.env.local` + Vercel env): `RESEND_API_KEY`, `EMAIL_FROM` (an address on your verified domain).
- **Not on this list:** the eventual **GCP / Firebase (Dammam) migration** for KSA data residency — that's a future re-platform, not a monthly line item today. See [FIREBASE-MIGRATION.md](./FIREBASE-MIGRATION.md).
