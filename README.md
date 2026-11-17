# Tabby

Split shared expenses with friends (groups, trips, settle-up), with a personal
finance layer being added on top. See [FINANCE_PLAN.md](FINANCE_PLAN.md) for
the roadmap.

| Part | Where it runs |
|---|---|
| API (`server/`) | Express + Mongoose on Render (`https://tabby-api-bpb4.onrender.com/api`) |
| Database | MongoDB Atlas |
| Web app (`src/`) | React + Vite on Netlify |
| Android app | Capacitor 8 (`com.tabby.app`), updated over the air from GitHub Releases |

How builds, APKs and in-app OTA updates work:
[.agents/rules/apk_ota_workflow.md](.agents/rules/apk_ota_workflow.md).

## Money (personal finance)

Under the **Money** tab: one ledger across all your bank accounts and cards,
built from bank alert emails (pushed from Gmail by a free Apps Script) and
statements you upload. Four pages:

- **Overview:** one card each for spending, insurance and investments, plus
  what's due soon and alerts.
- **Spending:** any month, quarter, year (FY or calendar) or custom dates; a
  pie by category, day/month trend, top places, monthly budgets (overall and
  per category, alerts at 80% and 100%), bills due, and the payment list with
  a Split button to share a payment with a group.
- **Insurance:** premiums paid this year, renewals due in 30 days with Renew
  links, filters by person and type, charts, and the year-by-year table.
- **Investments:** mutual funds, stocks, FDs, PPF/EPF, NPS, gold with value
  history, gains, SIPs and money put in each month.

Setup screens (bank accounts, categories, statement import, documents, PDF
passwords) live under **Settings → Money**.
It runs entirely on free tiers and uses no AI: known bank formats are read
by exact parsers, anything else waits in the review queue.

Code lives in `server/finance/` and `src/features/finance/`. Money is stored
as integer paise; dates are UTC, business days are India time.

### Insurance, automatically

When an insurer (or PolicyBazaar, Ditto…) emails you a policy, the Gmail
script delivers it and Tabby files it on its own: insurer, policy number,
vehicle number, cover, premium, dates and nominee are read from the email and
the policy PDF, the PDF is attached, renewal reminders are scheduled and the
premium payment is linked (also when paid through Acko/Razorpay/PolicyBazaar).
Renewals update the same policy. It is marked "Auto-added · tap to check".

- Reading uses the labels on Indian policy schedules (no AI). Optional backup:
  Cloudflare Workers AI (`CF_ACCOUNT_ID`, `CF_AI_TOKEN`), masked text only.
- Locked PDFs: save the password once under Insurance → PDF passwords.
- Scanned PDFs and photos are read **on your phone** (pdf.js + Tesseract OCR,
  free; the OCR engine downloads from cdn.jsdelivr.net the first time).
  Use Insurance → "Add from document", or "Scan & add policy" in Review.

### One-time setup

1. **Render:** set `DATA_ENCRYPTION_KEY` (back it up offline), `INGEST_HMAC_SECRET`,
   `INGEST_OWNER_EMAIL`, `JOBS_SECRET`, and for documents the `R2_*` variables
   (see `.env.example`). Optionally `ALLOWED_EMAILS` to restrict Money to you.
2. **Cloudflare R2:** create a private bucket and an API token scoped to it.
3. **Gmail:** install `tools/apps-script/Code.gs` (steps in its README), then run
   `backfill('2026-11-01')`.
4. **GitHub:** add repository secret `TABBY_JOBS_SECRET` (same as `JOBS_SECRET`) for
   `.github/workflows/finance-jobs.yml`, and for nightly encrypted backups
   `MONGODB_URI`, `BACKUP_PASSPHRASE` and the `R2_*` values for `backup.yml`.
5. **In the app:** Money → Accounts: add every account/card with its last 4
   digits (and debit card numbers), save statement passwords, upload last
   month's statement; Money → Insurance: add policies.

## Run locally

Requires Node.js 22.

```bash
npm install
cp .env.example .env
```

In `.env`, set at least `JWT_SECRET` (any long random string) and
`MONGODB_URI`. To get sample data in your local database, also set
`SEED_DEMO=true`.

```bash
npm run dev
```

This starts the API on http://localhost:5000 and the web app on
http://localhost:3030 (which proxies `/api` to the API).

Sign in with Google, or press **Try the demo** to explore sample data that
stays on your device.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API and web app together |
| `npm run lint` | TypeScript type check |
| `npm test` | Unit and API tests (vitest, supertest, in-memory MongoDB) |
| `npm run build` | Production web build into `dist/` |
| `npm run cap:sync` | Build and copy the web app into the Android project |

The first `npm test` downloads a MongoDB binary (about 120 MB) from
`fastdl.mongodb.org` and caches it.

## Deploying

- **API:** Render deploys `server/` with `npm start`. Set the variables from
  `.env.example` there. The server will not start without `JWT_SECRET`.
- **Web and Android:** pushing frontend changes to `main` builds the web app,
  publishes a GitHub Release with `dist.zip`, and installed apps offer the
  update in-app. Native changes (`android/`, `capacitor.config.ts`, new
  plugins) need a new APK from the "Build APK" workflow.

## Security notes

- Finance data is scoped to its owner on every query. Documents, email bodies
  and statement passwords are AES-256-GCM encrypted; email bodies are deleted
  after 30 days and OTP emails are never stored.
- The Gmail webhook only accepts HMAC-signed requests less than 5 minutes old;
  the jobs endpoint needs `JOBS_SECRET`.
- Every `/api` route except `/api/health` and `/api/auth/google` needs a
  `Bearer` session token, and every query is scoped to the signed-in user.
- Never put secrets in `VITE_` variables; they are bundled into the app.
- MongoDB Atlas network access is open to `0.0.0.0/0` so Render can reach it:
  keep a long random database password and rotate it periodically.
