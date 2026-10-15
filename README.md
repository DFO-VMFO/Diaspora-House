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

## Deploy
Push to `main`; the workflow publishes to GitHub Pages (Settings, Pages, Source: GitHub Actions). Private-repo Pages needs a paid GitHub plan; any static host (Netlify, Vercel, Cloudflare Pages) also works by serving this folder.
