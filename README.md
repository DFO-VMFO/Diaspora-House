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
- **Dues:** the CEO, Membership Lead and Auditor see dues. Per member: tracking start month, a payment ledger (amount, date, method, note), and a status of Paid up, Due now, Past due or Not tracking. Dues are due on the 1st with a grace period to the 10th. Comped and paused members are set in the member form. Past-due members show on the dashboard. Payments are recorded by hand for now; card billing through Stripe is a later step. Dues live in their own store (`ops:member_dues`), readable only by the CEO, Membership Lead and Auditor, so other staff cannot see who owes what.

## Events: ticket sales and check-in (build #5)
- Turn on **Sell tickets online** on an event (it needs a ticket price and capacity), then use the send icon on the Events row to copy the public link (`/tickets/?e=<event id>`).
- Buyers pay through Stripe Checkout (`create-checkout`). The signed Stripe webhook (`stripe-webhook`) records the order under `ops:ticket_orders` and emails the buyer a confirmation with an 8-character door code. Seats left = capacity - held - app RSVPs - tickets sold. If two buyers race for the last seats, the later order is flagged **needs review** and the CEO is emailed.
- The attendance screen has a ticket-holder list with search, check in one or all, undo, adding door and comp guests, and CEO-only Mark refunded. Refund the card in Stripe separately.
- Ticket revenue flows into each house's revenue and profit automatically.
- **Stripe is in sandbox (test) mode.** Going live means a live webhook endpoint plus swapping the secret key, nothing else.
- Setup: the edge function secret `STRIPE_SECRET_KEY` must be set (Supabase, Edge Functions, Secrets). The webhook signing secret is already stored.

## Budgets: forecasts and approval
- Each budget shows a **forecast at completion**: every line finishes at the larger of its plan and its spend, plus provider jobs and staff shifts charged to it. Optional start/end dates add a pace estimate. Over-forecast budgets raise a dashboard alert.
- **Approval:** a budget is Draft -> Awaiting approval -> Approved (or Sent back with a reason). Only the CEO approves, sets the approved amount, closes or reopens. Approved budgets lock their line items; staff with budget access use "Request a change".
- Email: `budget-notify` emails the CEO on submit and the submitter on a decision.
- Pending: the database guard at the bottom of `supabase/schema.sql` (not yet applied) enforces these rules server-side, and Programming has no budget access until you grant it there.

## Member app: each house's own spaces
The Spaces screen reads `ops:spaces` and `ops:locations` from the shared store. Members pick a house (their own is marked) and see only that house's rooms; rooms staff put in maintenance show as closed, and houses marked "opening soon" say so. Edit spaces in the Ops Console and they appear in the member app within about 20 seconds.

## Programming Series: the recurring cultural calendar (build #6)
- **What it is:** a series is a rule, such as "every Wednesday 7 PM", "first Thursday of the month", "every other Saturday" or "every Oct 9". Staff manage them in the Ops Console under **Programming Series** (stored as `ops:event_series`).
- **Generate upcoming events** turns each active series into real events for the next 8 weeks (or the series' own horizon; heritage dates look 26 weeks ahead). Ids are built from series, date and house, so generating again never duplicates. A series set to "All active houses" creates one event per active house.
- **Starter calendar:** one click loads 19 series: In Conversation, The Ancestral Table, The Sommelier's Table, Griot Pit Live, Rooftop Sessions, Griot Cinema, Pitch & Pinot, Elders' Council Tea, The Genealogy Circle, and ten annual heritage moments (Black History Month, Ghana Independence, Africa Day, Juneteenth, Emancipation Day, Heritage Day South Africa, Nigeria, Uganda, Kenya, Kwanzaa). Edit, pause or delete any of them. Rooms, seats, hosts and times are placeholders to adjust per house.
- **Rotating themes:** one theme per line; each occurrence is named "Series: theme" and the themes cycle by date.
- **Skipping a night:** cancel that event. Do not delete it, because a deleted event is generated again. After changing a series, use the arrow on its row to push the new time, room, seats and description to its upcoming events (names and cancellations are kept).
- **Member app:** Events shows **The House Rhythm** (weekly and monthly series with the next date), a **Follow** toggle (kept on the member's device) with a **Following** filter, new **Screenings** and **Heritage** filters, series info on each event, and **Add every one to my calendar** (a repeating calendar file).
- **Database:** run `supabase/migrations/20261018_event_series.sql` to give the Programming role write access and other staff roles read access. The CEO does not need it.

