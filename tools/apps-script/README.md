# Gmail → Tabby (Google Apps Script)

This script runs inside the Gmail account that receives your bank alerts and
pushes money-related emails to Tabby. It is free, needs no Google Cloud
project, and never shares your Gmail password or a Gmail token with Tabby.

## What it sends

- Emails from the last 3 days matching money words (debited, credited, refund,
  invoice, EMI, statement, policy, ₹ …), excluding Promotions and Social.
- Plain-text body (max 100 KB) and PDF/JPG/PNG/HEIC attachments (max 10 MB each).
- **Never** OTP / verification-code emails.

Each request is signed with HMAC-SHA256 and a timestamp; Tabby rejects
anything unsigned or older than 5 minutes. Sent threads get the label
`tabby-sent`; failures stay unlabelled and are retried on the next run.

## Setup (once, about 5 minutes)

1. On Render, set two environment variables on the Tabby API service:
   - `INGEST_HMAC_SECRET`: a long random string, e.g. from
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `INGEST_OWNER_EMAIL`: the Google account you sign in to Tabby with.
     Sign in to Tabby once with it before continuing.
2. Open https://script.google.com while signed in to the Gmail account with
   the bank alerts, and create a **New project** named "Tabby sync".
3. Replace the contents of `Code.gs` with this folder's `Code.gs`. Save.
4. **Project Settings → Script Properties → Add script property**:
   - `TABBY_INGEST_URL` = `https://tabby-api-bpb4.onrender.com/api/finance/ingest/email`
   - `TABBY_HMAC_SECRET` = the same value as `INGEST_HMAC_SECRET`
5. In the editor, select `installTrigger` and press **Run**. Approve the
   permission prompt (Gmail read/label and external requests). This adds a
   trigger that runs `syncRecent` every 10 minutes.
6. Import history: select `backfill`, or run from the console
   `backfill('2026-11-01', '2026-11-30')`. It sends in batches of 100 and is
   safe to re-run.
7. Optional: add a second time-driven trigger for `keepAwake` every 10
   minutes so the free Render instance doesn't sleep (one free service fits
   in Render's 750 free hours a month).

Check **Executions** in the Apps Script editor for errors. Anything Tabby
can't read lands in **Money → Review** in the app.
