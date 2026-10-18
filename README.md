# FSAC Four-Masters Registration — Supabase test project


## Updated separated-page frontend

- `index.html` is the public registration page.
- `admin.html` is the separate administrator login and dashboard.
- `register.js` handles public registration only.
- `app.js` handles the admin dashboard and manual participant creation.
- `styles.css` uses the FSAC flyer palette (magenta/pink, white, and navy) and partner logos.
- The SSB logo links to the MasterSSB website.

For GitHub Pages, publish the repository root. The public form will be at `/` or `/index.html`, and the admin dashboard at `/admin.html`. Keep the existing `config.js` with the same TEST Supabase URL and publishable/anon key; never add a service-role key. This update is for the separate TEST repository only.

This is a **separate test project starter**. It does not connect to or modify the current production website, Apps Script deployment, Google Sheet, or repository unless you deliberately configure it to do so.

## Architecture

- **Frontend:** static HTML/CSS/JavaScript, suitable for GitHub Pages.
- **Database and admin login:** Supabase Postgres + Supabase Auth + Row Level Security (RLS).
- **Google Sheets sync:** Supabase Database Webhooks call the `sheets-sync` Edge Function. The function rebuilds the `Participants` and `Formations` tabs from current database state after participant/conference INSERT, UPDATE, or DELETE events.
- **CSV export:** administrators can export the current filtered participant list.

Included features: public registration, open/closed conference controls, admin sign-in, participant search and filters, pagination, select all on current page, bulk present/absent, bulk delete with confirmation, participant editing, individual presence toggle, conference add/edit/open/close/delete, and CSV export.

## 1. Create isolated test services

1. Create a **new GitHub repository** such as `fsac-four-masters-supabase-test`. Do not use the production repository.
2. Create a **new Supabase project** explicitly for testing. Do not reuse the production project.
3. In the new Supabase SQL Editor, run `supabase/schema.sql`.
4. In Supabase Authentication, create an admin user using a strong password.
5. Copy that user's UUID from Authentication → Users. In the SQL Editor, authorize it:
   ```sql
   insert into public.admin_users(user_id) values ('PASTE-TEST-ADMIN-USER-UUID');
   ```
   Do not make an open signup form for admin users. Add admins only through the Supabase dashboard / trusted SQL.
6. Replace the four starter conference names with the exact official programme names in the admin panel.
7. In Authentication → URL Configuration, set the Site URL and allowed redirect URLs to the **test** GitHub Pages URL.

## 2. Configure GitHub Pages frontend

1. Copy `config.example.js` to `config.js`.
2. Put the **test** project's Project URL and anon/publishable key in `config.js`. The anon key is intended to be public; security depends on RLS policies. Never place a `service_role` key or Google private key in frontend code.
3. The provided `index.html` already loads `config.js` before `app.js`. Keep `config.js` out of version control if you prefer, and configure the file only in the test repository deployment.
4. Push the files to the new test repo and enable GitHub Pages in repository Settings → Pages.
5. Test public registration and admin access. A visitor must not be able to read participant records or change admin/conference data.

## 3. Configure Google Sheets synchronization

This integration needs a **separate test spreadsheet** and a Google service account. Keep credentials only in Supabase Edge Function secrets.

1. Create a test Google spreadsheet. Create tabs named exactly `Participants` and `Formations`. Note the spreadsheet ID from its URL.
2. In Google Cloud Console, enable the **Google Sheets API** and create a service account. Generate a private key for it, then share the test spreadsheet with the service-account email as an Editor.
3. Install the Supabase CLI and link it to the **test** Supabase project. Deploy the function:
   ```bash
   supabase functions deploy sheets-sync
   ```
4. Set Edge Function secrets (use the actual test values; do not commit them):
   ```bash
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL="service-account@project.iam.gserviceaccount.com"
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   supabase secrets set GOOGLE_SHEETS_SPREADSHEET_ID="TEST_SPREADSHEET_ID"
   supabase secrets set SHEETS_WEBHOOK_SECRET="GENERATE_A_LONG_RANDOM_SECRET"
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are normally provided by Supabase Edge Functions; if your environment does not inject them, set them as secrets from the test project settings.
5. Configure database webhooks in the Supabase dashboard for both `public.participants` and `public.conferences`, events **INSERT**, **UPDATE**, and **DELETE**, targeting the deployed `sheets-sync` Edge Function URL.
6. Set the request header `x-sheets-webhook-secret` to the exact `SHEETS_WEBHOOK_SECRET` value. If the dashboard webhook UI cannot add a custom header, use a small Postgres trigger + `pg_net` call that includes this header, or place a trusted relay in front of the function. Do not remove the function's authentication check just to make the webhook work.
7. Run a test registration, edit a participant, mark presence, delete a test participant, and close a conference. Confirm both tabs in the **test** spreadsheet reflect each change.

### Sync behavior and notes

- Every webhook refreshes both tabs from the current database, so updates and deletions are reflected without trying to infer row numbers.
- This is intentionally simple for a small event-registration list. Concurrent events may briefly race; if the list becomes large, replace full-sheet rebuilds with an idempotent outbox/queue and row-level upserts.
- The service account must be able to edit the spreadsheet. The function clears only the named data ranges, not the entire spreadsheet.
- Keep the spreadsheet private; it contains participant personal information. Restrict sharing and retention appropriately.
- Database webhooks can retry or arrive out of order; the rebuild approach is mostly idempotent, but high-volume production deployments should use a queued worker and logging.

## 4. Security model

- Public users can read open conference options and submit registrations only while a conference is open.
- Public users cannot read participant records.
- Authenticated users can manage participants/conferences only if their UUID exists in `admin_users`.
- Admin membership cannot be changed from the browser because no insert/update/delete policy is granted on `admin_users`.
- Use a unique strong password for each admin, enable MFA if practical, and remove access promptly when an admin leaves.
- The browser uses only the public anon/publishable key. Secrets stay in Supabase.
- This starter is not yet production-hardened: add CAPTCHA/rate limiting, duplicate-registration policy, audit logging, email confirmation policy, and robust webhook retry monitoring before real use.

## 5. Test checklist

- [ ] New repository and new Supabase project are separate from production.
- [ ] Anonymous visitor sees only open formations.
- [ ] Anonymous visitor can submit a registration but cannot read participant rows.
- [ ] Unapproved authenticated user cannot open the admin panel.
- [ ] Authorized admin can search/filter/edit participants.
- [ ] Bulk selection, bulk present/absent, and confirmed bulk delete work.
- [ ] Admin can add/edit/open/close formations.
- [ ] CSV export opens correctly in Google Sheets.
- [ ] Insert/update/delete events synchronize to the test spreadsheet.
- [ ] Production repository, Apps Script, and spreadsheet remain unchanged.

### Enable manual participant creation in an existing TEST database

After deploying the updated frontend, open the Supabase SQL Editor for the TEST project and run `supabase/admin-manual-participant-policy.sql` once. This grants INSERT to authenticated users who are members of `public.admin_users`. Do not run it against the production database.
