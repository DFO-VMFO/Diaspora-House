# Diaspora House

Members-only club for the global African Diaspora.

- `/` member app (Club Brain)
- `/ops/` staff Ops Console (sign in with a House staff account)

Both are single-file HTML apps that talk to the **Diaspora-House** Supabase project (`eptsqnvenmllmzshigoi`, its own sign-in pool, separate from the Family Office projects).
The Supabase URL and *anon* key baked into the files are public by design; every table is protected by row-level security and role rules (`supabase/schema.sql`).

## Sign in
The Ops Console (`/ops/`) requires sign-in with **an emailed one-time code, no passwords**. A team member enters their work email, Supabase emails a 6-digit code, they type it in. Only emails with an active row in `staff_profiles` get in, and the row's role decides what they can read and write (row-level security).

- One-time Supabase setup: Authentication, Email Templates, "Magic Link" must include `{{ .Token }}` (for example `<p>Your House sign-in code: <b>{{ .Token }}</b></p>`).
- CEO: `brandon@diasporafamilyoffice.com`. Add teammates by creating their auth user and a `staff_profiles` row.
- The mock `@house.diaspora.test` accounts are deactivated (`active=false`). The `demo-login` edge function is still deployed but cannot open them.
- The member app (`index.html`) is still in open mode.
- Sign-in codes are sent by the `send-code` edge function through Resend (domain diasporafamilyoffice.com). The Resend key lives in the private `app_secrets` table, not in this repo. Codes are 8 digits.

## Deploy
Push to `main`; the workflow publishes to GitHub Pages (Settings, Pages, Source: GitHub Actions). Private-repo Pages needs a paid GitHub plan; any static host (Netlify, Vercel, Cloudflare Pages) also works by serving this folder.

## Providers (build #3)
- **Documents:** W-9, insurance, agreements and licenses upload to the private `provider-docs` storage bucket (CEO only) from a provider's page. Expiry dates drive dashboard alerts and the `expiry-reminders` function, which pg_cron runs daily at 14:00 UTC and which emails the provider and a digest to the CEO at 30/14/7/3 days, the day of, and after expiry.
- **Scorecard:** computed from real job history (acceptance 35%, on-time 25%, reply speed 20%, rating 20%).
- **Offers:** `send-offer` emails each offer with a private link to `/j/`. The provider accepts or declines there (`job-response` function) and the console applies the reply within about 20 seconds. Text and WhatsApp need a Twilio account and are not connected yet, so those providers get email.

## Members (build #4)
- **Profile:** click a member's name (or the people icon) for a profile with details, Capital Profile, and activity across requests, rooms, Souk, events, classes and service jobs.
- **Dues:** the CEO, Membership Lead and Auditor see dues. Per member: tracking start month, a payment ledger (amount, date, method, note), and a status of Paid up, Due now, Past due or Not tracking. Dues are due on the 1st with a grace period to the 10th. Comped and paused members are set in the member form. Past-due members show on the dashboard. Payments are recorded by hand for now; card billing through Stripe is a later step.
