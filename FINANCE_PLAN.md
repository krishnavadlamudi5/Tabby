# Tabby Finance Plan

> **Agreed changes (14 Nov 2026).** These override the original guide below
> wherever they conflict.
>
> 1. **Runs for ₹0 a month.** Render free, Atlas M0, Netlify, Google Apps
>    Script, GitHub Actions, Resend free, Firebase Cloud Messaging (later).
> 2. **No AI in the finance pipeline.** Bank and payment emails are parsed by
>    per-sender parsers (exact to the paisa). Unknown senders go to the
>    review queue; corrections become rules, and repeat senders get a parser.
>    Policies are entered by hand. `aiExtract.ts` and the "amount must appear
>    in the email" AI guard are dropped. The existing Gemini receipt scanner
>    stays as it is.
> 3. **Files go to Cloudflare R2** (free 10 GB), encrypted with AES-256-GCM on
>    the server before upload; the bucket stays private. GridFS is not used.
>    Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
>    `R2_BUCKET` (server only).
> 4. **No Render Cron Job (paid).** Scheduled jobs and nightly encrypted
>    backups (Atlas M0 has no snapshots) run from a GitHub Actions schedule or
>    an Apps Script trigger calling `/api/finance/jobs/run`.
> 5. **Atlas 512 MB budget.** Keep extracted fields permanently; delete
>    `RawEvent.bodyText` after 30 days and encrypt it at rest until then.
> 6. **Phase 2 is split:** 2a = manual ingest, parsers F1–F16 and ledger logic
>    (tested offline); 2b = Apps Script push, signed ingest route, CSV/PDF
>    statements and reconciliation.
> 7. **Ledger fixes:** dedupe uses the 15-minute window only across different
>    sources (bank alert vs merchant receipt) and allows an unknown account
>    on the merchant side; two same-amount payments from one source are never
>    merged. Fixtures F2/S1 use one consistent amount.
> 8. **Phase 0 deviations:** the session token is stored in localStorage on
>    both web and Android (Capacitor Preferences would need a new APK);
>    `user-alex` is demo data only, so nothing was migrated.

---

## Original implementation guide

> **How to use this file:** Put it in the repo root as `FINANCE_PLAN.md` and tell Claude Code:
> *"Read AGENTS.md, .agents/rules/apk_ota_workflow.md and FINANCE_PLAN.md. Work through FINANCE_PLAN.md phase by phase, starting with Phase 0. Stop at the end of each phase and show me what changed before continuing."*

---

## 0. Instructions for the coding agent (read first)

1. **Respect the existing architecture.** Read `AGENTS.md` and `.agents/rules/apk_ota_workflow.md`. Do **not** change the APK build, the OTA live-update mechanism (`useLiveUpdate.ts`, `@capgo/capacitor-updater`, `deploy-live-update.yml`), or the hosting (Render API + MongoDB Atlas + Netlify web + Capacitor Android).
2. **Work phase by phase, in order.** Phase 0 (security hardening) blocks everything else. Do not start a phase until the previous phase's "Done when" checks pass.
3. **Small commits.** One commit per numbered task, with a clear message (the commit title becomes the OTA release note).
4. **Every task ships with tests** (see §3.6). Run `npm run lint` and `npm test` before each commit.
5. **Never commit secrets.** `.env*` is git-ignored; keep it that way. New secrets go in `.env.example` as placeholders with a comment, and on Render as environment variables.
6. **Backend and frontend must deploy together** when an API contract changes (e.g. auth). The backend deploys on Render; the frontend ships via OTA on push to `main`. If a change would break the currently installed app, say so before merging.
7. **Ask the owner before:** deleting or migrating existing MongoDB data, changing a public API response shape used by the installed app, or adding a paid service.
8. **When unsure, stop and ask** rather than guess — this app will hold real bank and insurance data.

---

## 1. What we are building

Tabby today is a Splitwise-style shared-expense app. We are adding a **personal finance layer** on top of it:

| Module | Purpose |
|---|---|
| **Ingestion** | Pull every money-related email from Gmail (any sender), plus monthly bank/card statements, and turn them into accurate transactions. |
| **Transactions & categories** | One ledger across all bank accounts and cards, auto-categorised, with budgets. |
| **Split** | Split one payment across categories (e.g. groceries into vegetables / staples / household) and/or across people. |
| **Trips** | Extend Tabby's existing trip groups with dates, budget and personal-transaction linking. |
| **Insurance & document vault** | Track every policy (premium, sum insured, renewal, members, claims) and store documents encrypted. |
| **Commitments** | EMIs, SIPs, subscriptions, premiums: due dates and paid / missed / failed status. |
| **Dashboard & alerts** | Monthly spend, upcoming dues, pending refunds, review queue, renewal reminders. |

**Accuracy target:** each month, the app's totals per account must match the bank statement to the paisa.

---

## 2. Current codebase map (as of 14 Nov 2026)

```
server/
  index.ts                 Express app, CORS allowlist, routes, starts server, seeds demo data
  db.ts                    Mongoose connect
  middleware/auth.ts       ⚠ requireAuth hardcodes req.userId = 'user-alex'; signToken returns 'mock-token'
  models/                  User, Group, Expense, Activity (string ids, string dates, Number amounts)
  routes/                  users, groups, expenses, activities, sync, receipt (Gemini, server-side)
  services/notificationService.ts   Email OTP via Resend / SMTP (unused now that login is removed)
  seedDemo.ts              Demo users/groups/expenses
src/
  App.tsx                  View switching via `activeView` state (no router)
  store/useAppStore.ts     Zustand store; localStorage-first persistence; defaults to demo user-alex
  lib/api.ts               fetch wrapper; DB write helpers swallow errors
  components/              Dashboard, Group, Friend, ExpenseModal (splits), SettleUp, ReceiptScanner, Notifications, Settings
  utils/                   currency (INR default), debtSimplifier, export
  hooks/useLiveUpdate.ts   OTA updater (do not change)
android/, capacitor.config.ts   Capacitor 8 app (com.tabby.app)
.github/workflows/deploy-live-update.yml   OTA release on push to main
```

**Reuse, don't rebuild:**
- Groups with `category: 'trip'` → Trips module.
- `ExpenseModal` split methods (equally / exactly / percentage) + `debtSimplifier` + `SettleUpModal` → people split and trip settle-up.
- `routes/receipt.ts` Gemini integration → pattern for all AI extraction (emails, receipts, policy PDFs).
- `recharts`, `NotificationsView`, `ToastContainer`, Resend email → dashboard and alerts.

---

## 3. Conventions for all new code

### 3.1 Money
- Store money as **integer paise** in fields named `amountPaise` (₹331.00 → `33100`). Never floats for new finance data.
- Every money record also stores `currency` (default `'INR'`). Foreign amounts keep `originalAmountMinor` + `originalCurrency`.
- Convert only at the UI edge with a helper `formatPaise(paise, currency)` added to `src/utils/currency.ts`.
- **Do not migrate existing `Expense.amount` in Phase 0** (the installed app sends rupees). Leave shared expenses as-is; new finance models use paise. Converting `Expense` is a later, coordinated task.

### 3.2 Dates and time
- Store real `Date` fields (Mongoose `type: Date`) in UTC. Business logic (month boundaries, "today", due dates) uses **Asia/Kolkata**. Use `date-fns` + `date-fns-tz`.
- Keep `postedAt` (when the bank says it happened) separate from `createdAt` (when we recorded it).

### 3.3 IDs and ownership
- New models: server-generated ids (`nanoid` or Mongo `_id`), never client `Date.now()`.
- Every finance document has `ownerId` (the authenticated user). **Every query filters by `ownerId`.** Add a tiny helper `scoped(req)` returning `{ ownerId: req.userId }` and use it everywhere.

### 3.4 Folder structure for new code
```
server/finance/
  models/        Account, Transaction, RawEvent, Category, Rule, SenderProfile, Statement,
                 Trip fields (on Group), Policy, Claim, Document, Commitment, Alert
  routes/        accounts, transactions, categories, rules, review, ingest, statements,
                 policies, documents, commitments, dashboard, jobs
  services/
    ingest/      ingestEmail.ts, detect.ts, parsers/ (one file per known sender), aiExtract.ts
    ledger/      dedupe.ts, linkRefunds.ts, selfTransfer.ts, categorize.ts, reconcile.ts
    statements/  unlockPdf.ts, parseStatement.ts
    storage/     crypto.ts (AES-256-GCM), fileStore.ts
    jobs/        reminders.ts, refundWatch.ts, commitmentWatch.ts
  validation/    zod schemas shared by routes
  __fixtures__/  sample emails & statements for tests
src/features/finance/
  api.ts, store.ts (zustand), types.ts
  views/         FinanceHome, Transactions, TransactionDetail, ReviewQueue, Groceries,
                 Trips (extensions), Policies, PolicyDetail, Documents, Commitments, Accounts, FinanceSettings
  components/    SplitEditor, CategoryPicker, AmountInput, PolicyCard, RenewalBadge, UploadDropzone, ...
tools/apps-script/Code.gs   Gmail → Tabby push script (see Phase 2)
```

### 3.5 API style
- All new routes under `/api/finance/...`, protected by the real `requireAuth` (Phase 0).
- Validate every request body with **zod**; return `400` with field errors.
- Responses: `{ success: true, ...data }` or `{ error: string, details? }` (matches existing style).
- Pagination: `?cursor=&limit=` (default 50, max 200).

### 3.6 Testing
- Add **vitest + supertest + mongodb-memory-server**. Script: `"test": "vitest run"`.
- Every parser has fixture-based tests (`server/finance/__fixtures__/emails/*.json` → expected record).
- Ledger logic (dedupe, refund linking, self-transfer, reconcile) has unit tests with the scenarios in §12.

---

## 4. Phase 0 — Security hardening (do first)

### 0.1 Restore real authentication
- **Server:** replace `server/middleware/auth.ts`:
  - `POST /api/auth/google` — body `{ idToken }`. Verify with `google-auth-library` (`OAuth2Client.verifyIdToken`, audience = web + Android client IDs from env). Find or create the `User` (`authProvider: 'google'`; if a `ghost` user with the same email exists, claim it). Return `{ token, user }`.
  - `signToken(userId)` → real JWT (`jsonwebtoken`, `JWT_SECRET`, 30-day expiry). Server must refuse to start if `JWT_SECRET` is missing (as `.env.example` already says).
  - `requireAuth` → read `Authorization: Bearer <jwt>`, verify, set `req.userId`; `401` otherwise.
  - Optional `ALLOWED_EMAILS` env (comma-separated): if set, only these emails may use `/api/finance/*`.
- **Client:**
  - Login screen shown when there is no valid token. Web: Google Identity Services button (`VITE_GOOGLE_CLIENT_ID`). Android: `@capgo/capacitor-social-login` (already installed, Google enabled in `capacitor.config.ts`).
  - Store token (Capacitor Preferences on Android, localStorage on web). `lib/api.ts` adds the `Authorization` header; on `401` clear the token and show login.
  - Remove the `user-alex` default in `useAppStore.initStore`; demo mode only behind an explicit "Try demo" button that never touches the server.
- **Done when:** calling any `/api/*` route except `/api/health` and `/api/auth/google` without a token returns `401`; two different Google accounts see only their own data.

### 0.2 Lock down user data
- `GET /api/users` must return only the caller, their friends, and members of groups they belong to. No "list everyone". `?ids=` is filtered to that same set.
- Never return `password`, and never return other users' `phone` unless they are friends.

### 0.3 Demo data off in production
- `seedDemoData()` runs only when `SEED_DEMO=true` (default false). Remove the auto-seed call in `routes/sync.ts`.

### 0.4 Reliable saves (server is the source of truth)
- Today `lib/api.ts` write helpers catch and log errors and the store writes to localStorage first, so phone and server can drift.
- Change to: write helpers **throw**; the store applies the change optimistically **and** puts it in an **outbox** (localStorage) until the server confirms; retry with backoff when online; show a toast on failure and a small "unsynced changes" indicator. On sync, server data wins.
- **Done when:** with the API stopped, adding an expense shows "pending sync"; when the API returns, it syncs and the indicator clears.

### 0.5 Hardening odds and ends
- `capacitor.config.ts`: `allowMixedContent: false`.
- Add `helmet` and a global rate limit (e.g. 300 req / 15 min / IP) in `server/index.ts`; keep the stricter receipt limiter.
- Remove the `GEMINI_API_KEY`/`APP_URL` AI Studio wording only if it no longer applies; keep the warning about never using `VITE_` for secrets.
- Housekeeping: `package.json` name → `tabby`; replace the AI Studio `README.md` with real setup steps; rename `splitwise_*` localStorage keys to `tabby_*` with a one-time migration.
- **Recommendation for the owner (not code):** MongoDB Atlas network access is `0.0.0.0/0`; keep a long random DB password and rotate it. Restrict IPs if Render's paid static outbound IPs are adopted.

### 0.6 Test harness
- Add vitest, supertest, mongodb-memory-server, and tests for auth (401 without token, scoping between two users).

**Phase 0 done when:** all of the above pass, the Android app logs in with Google, and existing shared-expense features still work for a logged-in user.

---

## 5. Phase 1 — Finance data model

Create Mongoose models in `server/finance/models/` (all with `ownerId`, `createdAt`, `updatedAt`, indexes noted).

**Account** — `name, institution ('kotak'|'icici'|'sbm'|'hdfc'|'zerodha'|...), type ('savings'|'current'|'credit_card'|'loan'|'investment'|'wallet'|'cash'), last4, aliases[] (other masked forms seen in emails, e.g. 'XX9564', 'XXXXXX9564'), cardLast4s[], statementPasswordEnc (AES-GCM, never returned to client), openingBalancePaise, isActive`. Index `(ownerId, last4)`.

**RawEvent** — every email / statement line we ever see. `source ('gmail'|'statement'|'manual'|'receipt'), sourceId (Gmail message id or statementId+line), sender, subject, receivedAt, bodyText, attachmentsMeta[], detectedType, parser ('kotak.card'|'ai'|...), parserVersion, extracted (JSON), confidence (0–1), status ('parsed'|'needs_review'|'ignored'|'error'), transactionIds[]`. **Unique index `(ownerId, source, sourceId)`** → re-sending the same email never duplicates.

**Transaction** — `accountId, postedAt, amountPaise (always positive), direction ('debit'|'credit'), currency, originalAmountMinor?, originalCurrency?, merchantRaw, merchant (normalised), description, channel ('card'|'upi'|'imps'|'neft'|'netbanking'|'autodebit'|'cash'|'other'), referenceIds[] (RRN, UPI txn id, IMPS ref, payment id), kind ('expense'|'income'|'refund'|'self_transfer'|'cc_bill_payment'|'reversal'|'fee'|'investment'|'emi'), status ('pending'|'settled'|'declined'|'reversed'), linkedTransactionId (refund ↔ original), categoryId, splits[] (see Phase 4), tags[], tripId?, sharedExpenseId?, notes, attachmentDocIds[], rawEventIds[], reconciled (bool), source`. Indexes: `(ownerId, postedAt)`, `(ownerId, accountId, postedAt)`, `(ownerId, referenceIds)`.

**Category** — `name, parentId?, icon, color, kind ('expense'|'income'|'transfer'), isSystem, sortOrder`. Seed defaults per user on first login:
- Groceries → Vegetables & fruits, Dairy & eggs, Staples (rice, atta, dal, oil), Snacks & beverages, Meat & fish, Household & cleaning, Personal care, Baby & kids, Pooja items
- Food & dining, Shopping, Health & medicines, Travel, Bills & utilities, Home & rent, Insurance, Loan EMI, Investments, Subscriptions, Education, Gifts, Fees & charges, Income, Refund, Self transfer

**Rule** — `match ({ merchantContains?, senderEquals?, channel?, amountMinPaise?, amountMaxPaise? }), action ({ categoryId?, kind?, tags?, splitTemplateId? }), priority, createdFrom ('user_correction'|'default')`.

**SplitTemplate** — `name, parts[{ categoryId, percent }]` (sums to 100).

**SenderProfile** — `sender (email/domain), displayName, parser, confirmedExamples[] (rawEventIds whose extraction the user confirmed), stats { seen, autoAccepted, corrected }`.

**Statement** — `accountId, periodStart, periodEnd, openingBalancePaise, closingBalancePaise, fileDocId, lineCount, status ('parsed'|'reconciled'|'mismatch'), mismatchPaise`.

**Group (extend existing)** — add optional `startDate, endDate, budgetPaise, currency` used when `category === 'trip'`. Additive only; old clients keep working.

**Policy** — `insurer, policyNumber, type ('health'|'term_life'|'life'|'vehicle'|'home'|'travel'|'personal_accident'|'other'), planName, insuredMemberIds[] (Person refs), nominee, sumInsuredPaise, premiumPaise, premiumFrequency ('monthly'|'quarterly'|'half_yearly'|'yearly'|'single'), paymentMode, startDate, renewalDate, termYears?, status ('active'|'renewal_due'|'lapsed'|'renewed'|'cancelled'), agent { name, phone, email }, claimHelpline, tpa, taxSection ('80C'|'80D'|null), premiumTransactionIds[], documentIds[], notes`.

**Person** — lightweight people for policies (family members) separate from Tabby friends: `name, relation, dob?, linkedUserId?`.

**Claim** — `policyId, date, reason, claimedPaise, settledPaise, status ('filed'|'in_review'|'settled'|'rejected'), documentIds[]`.

**Document** — `title, type ('policy'|'renewal_notice'|'premium_receipt'|'tax_certificate'|'claim'|'statement'|'invoice'|'warranty'|'loan'|'id'|'other'), mimeType, sizeBytes, sha256, storageKey, encryption { alg: 'aes-256-gcm', iv, tag, keyVersion }, linkedTo [{ kind: 'policy'|'transaction'|'trip'|'claim'|'statement', id }], extractedFields (JSON), source ('upload'|'gmail')`. Unique `(ownerId, sha256)`.

**Commitment** — `type ('emi'|'sip'|'subscription'|'premium'|'rent'|'other'), name, amountPaise, currency, schedule ({ freq: 'monthly'|'yearly'|..., dayOfMonth?, nextDueDate }), accountId?, matchRule (merchant/sender/amount tolerance), lastPaidTransactionId?, status ('paid'|'due'|'missed'|'failed'|'paused'), policyId?`.

**Alert** — `type, title, body, dueAt?, entity { kind, id }, readAt?, channels ['in_app','email']`.

**Done when:** models compile, indexes created, zod schemas exist, default categories seed on first login, unit tests for ownership scoping pass.

---

## 6. Phase 2 — Ingestion pipeline (dynamic, any sender)

### 2.1 Getting emails out of Gmail — use a Google Apps Script push (recommended)
Reason: a Gmail API OAuth app with the `gmail.readonly` scope left in "Testing" mode has refresh tokens that expire every 7 days, and publishing it needs Google's restricted-scope verification. An Apps Script running inside the owner's own Gmail avoids both and is free.

Create `tools/apps-script/Code.gs` + `tools/apps-script/README.md`:
- Time-driven trigger every 10 minutes.
- Search: `newer_than:3d -label:tabby-sent -category:promotions -category:social (debited OR credited OR paid OR payment OR refund OR refunded OR reversal OR invoice OR receipt OR order OR premium OR EMI OR installment OR "Rs." OR INR OR ₹ OR transaction OR statement OR policy OR renewal OR SIP OR subscription)`; also `has:attachment filename:pdf (statement OR invoice OR policy OR receipt)`.
- For each message: send `{ messageId, threadId, from, to, subject, date, bodyText (plain, HTML→text fallback, max 100 KB), attachments: [{ filename, mimeType, size, base64 }] (PDF/images only, ≤10 MB each) }`.
- POST to `https://tabby-6i0f.onrender.com/api/finance/ingest/email` with headers `X-Tabby-Timestamp` and `X-Tabby-Signature = HMAC-SHA256(INGEST_HMAC_SECRET, timestamp + "." + body)`.
- On HTTP 200/409 apply label `tabby-sent`; on failure leave unlabeled so the next run retries. Retry once after 60 s if Render is cold-starting.
- Store `INGEST_HMAC_SECRET` and the API URL in Script Properties (never in code).
- A `backfill(startDate, endDate)` function for importing history in batches of 100.
- Skip OTP emails (subject/body contains "OTP" / "one time password" / "verification code").

Server route `POST /api/finance/ingest/email`:
- Verify HMAC and timestamp (reject if older than 5 minutes) → map to the owner via `INGEST_OWNER_EMAIL` env.
- Idempotent on `(ownerId, 'gmail', messageId)`: return `409 already_ingested` if seen.
- Body limit 25 MB on this route only. Attachments go straight to encrypted file storage (§8.2) as `Document`s.
- Respond quickly; run the pipeline below in-process (later: queue).

Also provide `POST /api/finance/ingest/manual` (paste an email or SMS text) and a Gmail-API path later as an option, not now.

### 2.2 The pipeline (per RawEvent)
1. **Detect type** (`detect.ts`): cheap rules on sender/subject/body → `transaction | refund | declined | order | invoice | statement | bill_due | emi_due | subscription | policy | sip_report | otp | marketing | unknown`. Marketing/OTP → `ignored`.
2. **Parse — tier 1, known senders** (`parsers/*.ts`): deterministic regex parsers with fixtures, one per format in §12. Each returns a typed `Extraction` with `confidence: 1`.
3. **Parse — tier 2, AI for everything else** (`aiExtract.ts`): Gemini (`@google/genai`, model from `GEMINI_MODEL`, default `gemini-2.5-flash`) with **JSON mode + response schema** (not string cleanup). Prompt includes up to 3 confirmed examples from the same `SenderProfile` (few-shot) so accuracy improves as the user confirms items. Output schema:
   ```ts
   { eventType, amount: string, currency, direction, occurredAt, merchant, accountHint /* masked number or card last4 */,
     channel, referenceIds: string[], status, orderId?, lineItems?: {name, qty?, amount}[],
     policy?: { insurer, policyNumber, renewalDate, premium, sumInsured },
     dueDate?, confidence: number, notes? }
   ```
4. **Validate the extraction** (guards against AI mistakes):
   - The amount must appear literally in the email text (allow formats `5662`, `5,662`, `5662.00`, `₹5,662`). If not → `needs_review`.
   - Date within ±3 days of `receivedAt` (unless it's a due date).
   - `accountHint` must match an `Account` (last4 / aliases / cardLast4s); unknown → `needs_review` with "Add this account?".
   - Confidence < 0.85 → `needs_review`.
5. **Build or update Transactions** (`ledger/`):
   - **Dedupe** (`dedupe.ts`): same owner + same account + same amount + same direction, and either a shared `referenceId` or `postedAt` within 15 minutes → merge into one Transaction (append rawEventId, keep the richer merchant name). Example: a Kotak card alert and a Razorpay receipt for the same Meesho ₹138 → one transaction.
   - **Declined** → store as `status: 'declined'`, excluded from all totals.
   - **Refund / reversal linking** (`linkRefunds.ts`): credit with a reference id matching an earlier debit → `kind: 'refund'`, link both ways. Else match by merchant + amount ≤ original within 60 days. A merchant "refund initiated" email (e.g. Flipkart) creates an **expected refund** (`status: 'pending'`, expected date) that settles when the bank credit arrives.
   - **Self transfers** (`selfTransfer.ts`): IMPS/NEFT/UPI where beneficiary name = owner's name or beneficiary account/IFSC matches another owned Account → `kind: 'self_transfer'` (excluded from spend; shown in Accounts).
   - **Credit-card bill payments** → `kind: 'cc_bill_payment'`, not spend.
   - **Categorise** (`categorize.ts`): user Rules (priority) → merchant dictionary → AI suggestion → `Uncategorised`.
6. **Orders & invoices** (BigBasket, Blinkit, Amazon, Flipkart, Meesho, Nobero…): store line items on the RawEvent, then try to attach them to the matching payment (amount ± ₹1, within 2 days, merchant match) and pre-fill a category split (Phase 4).
7. **Non-transaction events** route to their module: policy/renewal → Policy suggestions; EMI due / SIP report / subscription renewal → Commitments; statement PDF → Statement import.

### 2.3 Review queue
- `GET /api/finance/review` lists `needs_review` RawEvents and uncategorised transactions.
- Actions: confirm, edit fields then confirm, mark ignore, "always ignore this sender", "create rule from this".
- Each confirmation adds the event to the sender's `confirmedExamples` (few-shot learning); each category correction creates/updates a `Rule`.

### 2.4 Statements (source of truth)
- When an ingested attachment or upload looks like a statement: identify account (filename / sender / text), unlock with the account's stored password (`pdfjs-dist` `getDocument({ data, password })`; if wrong, flag "password needed" in the UI — never ask in email).
- Parse lines: deterministic parser per bank where layout is known (Kotak, ICICI first); AI table extraction fallback; also accept CSV/XLSX downloads from net banking (`xlsx`/`papaparse`).
- Each line → RawEvent(source 'statement') → match to existing Transaction (date ±2 days, amount, direction, reference) or create new (this is how GPay/PhonePe UPI that never emailed gets in).
- **Reconcile** (`reconcile.ts`): opening balance + credits − debits must equal closing balance; mark matched transactions `reconciled: true`; anything unmatched → review queue; set `Statement.status` and `mismatchPaise`.
- Statement passwords: set in the app (Accounts → statement password), stored encrypted with `DATA_ENCRYPTION_KEY`, write-only from the client.

**Phase 2 done when:** all fixture tests in §12 pass; the owner's November 2026 Kotak and ICICI statements reconcile with mismatch ₹0.00 (or every difference is explained in the review queue); re-running ingestion creates zero duplicates.

---

## 7. Phase 3 — Transactions UI & categories

- Navigation: add a **Money** tab to the mobile bottom bar and a "Finance" section in `Sidebar.tsx`; extend `activeView` with finance views (keep the current no-router pattern, or introduce a light router only if the owner agrees).
- **Transactions list:** month switcher, filters (account, category, kind, status, tag, trip, text search), running totals; excluded kinds (self transfer, declined, cc bill payment) hidden by default with a toggle.
- **Transaction detail:** edit category, merchant, notes, tags; see linked refund/original; see source emails/statement lines; attach receipt; "Split" (Phase 4); "Add to trip"; "Share with friends" (creates a Tabby `Expense` with people splits, linked via `sharedExpenseId`).
- **Categories & rules screen:** add/rename/reorder categories and sub-categories; list/edit/delete rules.
- **Budgets:** monthly budget per category with progress bars on Finance Home.
- **Accounts screen:** balance per account (latest statement closing ± newer transactions), reconciliation status, statement password (write-only), aliases.

**Done when:** ≥90% of November transactions are categorised without manual input after the owner fixes the first few.

---

## 8. Phase 4 — Split feature

### 4.1 Category split (one payment → several categories)
- `Transaction.splits[]`: `{ categoryId, amountPaise, note?, lineItems?[] }`. Sum must equal `amountPaise` (server-validated; UI shows remaining amount live).
- Input modes: exact amounts, percentages, or a saved `SplitTemplate` ("Monthly kirana: 60% staples / 25% household / 15% snacks"). Rounding: allocate leftover paise to the largest part.
- **Auto-split from invoices:** when line items are attached (order email or scanned receipt), map each item to a grocery sub-category by keyword dictionary (`server/finance/services/ledger/groceryDictionary.ts`, e.g. tomato/onion → Vegetables; milk/curd/paneer → Dairy; atta/rice/dal/oil → Staples; detergent/cleaner → Household), AI fallback for unknown items, user can drag items between categories.
- Reuse `ReceiptScanner` for photo receipts; extend `routes/receipt.ts` to accept PDFs and use JSON-mode schema output.

### 4.2 People split
- Reuse Tabby's existing `ExpenseModal` split logic (equally / exactly / percentage) for "Share with friends". The personal transaction keeps the full amount; reports show **"my share"** = amount − what others owe, once shared.
- A transaction can have both a category split and a people split.

**Done when:** a BigBasket/Blinkit order email auto-splits into grocery sub-categories; a manual split validates totals; a shared expense appears in the friend's Tabby balances.

---

## 9. Phase 5 — Insurance & document vault

### 5.1 Encrypted file storage
- `storage/crypto.ts`: AES-256-GCM with `DATA_ENCRYPTION_KEY` (32 bytes, base64) and `keyVersion` for rotation.
- `storage/fileStore.ts`: interface `put/get/delete` with a **MongoDB GridFS** implementation first (no new vendor). Note Atlas free tier is 512 MB; keep an S3-compatible (Cloudflare R2) implementation behind the same interface for later.
- Upload via `multipart/form-data` (`multer`, memory storage, 20 MB max, PDF/JPG/PNG/HEIC only), **not** base64 JSON. Download streams decrypted content only to the owner, with `Content-Disposition`.
- Dedupe by SHA-256 per owner.

### 5.2 Policy tracker
- Screens: Policies list (cards with insurer, type, sum insured, premium, renewal countdown badge), Policy detail (all fields, members, nominee, documents, premium history, claims), Add/Edit policy.
- **Extraction from documents:** upload a policy PDF/photo → Gemini with a policy schema → pre-filled form for the owner to confirm (never auto-save).
- **From Gmail:** ingestion events typed `policy` / renewal notices create "Suggested policy" or "Renewal notice" items to confirm and file (e.g. Care Health policy emails, Bima Central renewal notices).
- **Premium linking:** match transactions to policies by insurer name + amount (±1%) near the renewal date; show premium history.
- **Claims:** add claim, status, documents.
- **Tax view:** yearly 80C / 80D totals from premium payments.

### 5.3 Documents screen
- Search by title/type/linked item; filters; upload; link/unlink to policy, transaction, trip, claim.

**Done when:** the owner's Care Health policy is filed with documents, renewal date and premium; reminders scheduled; documents download correctly and are unreadable in the raw DB.

---

## 10. Phase 6 — Trips

- Extend the existing trip group screens (`GroupView.tsx`) with dates, budget, and a "Personal transactions" panel.
- Personal transactions dated within the trip window are **suggested**; one tap "Add to trip" sets `tripId` and, if the trip has other members, creates a shared `Expense` with chosen split (reuse `ExpenseModal`).
- Trip categories: Travel, Stay, Food, Local transport, Activities, Shopping (sub-categories under Travel).
- Trip summary: total, per person, per category, vs budget; settle-up via existing `debtSimplifier` / `SettleUpModal`; export PDF/CSV (extend `utils/export.ts`).
- Ingestion hint: travel bookings (IRCTC, airlines, hotels) are tagged `travel` and offered for the nearest trip.

**Done when:** a real trip is tracked end to end with personal and shared spends and a correct settle-up.

---

## 11. Phase 7 — Commitments, dashboard & alerts

### 7.1 Commitments
- Create manually or from detection: same merchant/sender with similar amount (±5%) in ≥2 of the last 3 months → "Looks recurring — track it?".
- Seed suggestions from ingestion: loan "Installment Due" emails (EMI amount + due date), SIP order reports (including **failed** orders), subscription renewal notices, policy premiums.
- Status engine (`jobs/commitmentWatch.ts`): on due date + 2 days, if no matching debit → `missed`; SIP "order failed" email → `failed`; matching debit → `paid` and roll `nextDueDate`.

### 7.2 Finance Home dashboard
- This month vs last month spend (excluding self transfers / declined / cc bill payments), by category (recharts donut + bar).
- Next 14 days: EMIs, SIPs, subscriptions, premiums, policy renewals.
- Pending refunds with expected dates (overdue in red).
- Review queue count; unreconciled accounts.
- Groceries widget: sub-category breakdown + 6-month trend.

### 7.3 Alerts and jobs
- Jobs endpoint `POST /api/finance/jobs/run?job=...` protected by `JOBS_SECRET`, triggered by a **Render Cron Job** (the free web service sleeps, so in-process cron is unreliable). Schedule daily 08:00 IST plus hourly light checks.
- Alerts: large debit (> configurable threshold), declined transaction, refund past expected date, EMI/SIP missed or failed, renewal in 30/7/1 days, statement mismatch, new unknown account seen.
- Channels: in-app (`Alert` model surfaced in `NotificationsView`) + email via existing Resend setup (`ALERT_EMAIL_TO`). Push notifications (FCM) are a later phase.

**Done when:** dashboard numbers equal the transactions list totals; a test renewal triggers in-app + email alerts at the right dates.

---

## 12. Test fixtures — real formats seen in the owner's Gmail (Nov 2026)

Create one fixture per format (anonymise names; keep structure exact). Expected parse results in brackets.

| # | Sender | Subject | Body pattern | Expected |
|---|---|---|---|---|
| F1 | bankalerts@kotak.bank.in | Card online transaction- Successful | `Your transaction of Rs.331.00 on FLIPKART PAYMENTS using Kotak Bank Debit Card XX2797 on 14/11/2026 19:21:23 from your account XX9564 has been processed. The transaction reference No is <ref>` | debit ₹331.00, card 2797, account 9564, merchant FLIPKART PAYMENTS, channel card, ref |
| F2 | bankalerts@kotak.bank.in | Card transaction- declined | `The Kotak Bank Debit Card XX2797 transaction of Rs. 5662.00 at WWW AMAZON IN, on 14/11/2026 20:31:52 is declined as you have exceeded the domestic ECOM limit` | status declined, excluded from totals |
| F3 | BankAlerts@kotak.com | Notification regarding your recent transaction | `The amount of Rs. 7382.00 has been credited to your Kotak Bank Account XXXXXX9564 against your recent Debit Card transaction with RRN 631640283074.` | credit ₹7,382 kind refund/reversal, links to Amazon debit of 10 Nov (F1-style, same amount) |
| F4 | bankalerts@kotak.bank.in | IMPS Debit Transaction-Success | `your Account xx9564 is debited for Rs. 75000.00 on 02-Nov-2026 towards IMPS ... Beneficiary Name: <owner name> Beneficiary Account No: <acct> Beneficiary IFSC: ICIC0002386 IMPS Reference No: 630609288146` | debit ₹75,000, channel imps, kind self_transfer (beneficiary = owner / owned ICICI account) |
| F5 | customernotification@icici.bank.in | Transaction alert: UPI payment made using biometric authentication on iMobile | `UPI payment of ₹1,320 ... Credit Card: ICICI Bank Credit Card XXXXXXXXXXXX5002 Payee: VENKATAGIRI RICE AND GENERAL STORES Date and Time: Nov 14, 2026 , 06:59 PM Transaction ID: 111184394452` | debit ₹1,320 on credit card 5002, channel upi, merchant from Payee (HTML body — parse after HTML→text) |
| F6 | customernotification@icici.bank.in | Alert for transaction through ICICI Bank iMobile | `UPI payment of ₹10 using the iMobile app to SRI PRASAD MEDICALS. The payment was initiated from your ICICI bank account XXXXXXXX1042 through transaction ID ...` | debit ₹10, ICICI account ending 1042 (new account alias → review if unknown) |
| F7 | info@sbmbank.co.in | Credit Transaction Alert | `Your account XX7255 is credited with INR 12.00 on 01-...` | credit ₹12 SBM 7255 |
| F8 | no-reply@razorpay.com | Payment successful for Meesho technologies Pvt Ltd | `Meesho technologies Pvt Ltd ₹138.00 Paid Successfully Payment Id pay_... Method card ... Paid On 09 Nov, 2026 09:45:43 AM IST` | merges with Kotak card alert `RAZ*Meesho technologies P` ₹138 (dedupe) |
| F9 | payment-report@payu.in | Your Order at <MERCHANT> is successful | `completed a payment of Rs. 2752.00 to PRATYAYA E-COMMERCE PRIVATE LIMITED ... Payment Mode upi` | debit ₹2,752 upi (account unknown → review, or matched later from statement) |
| F10 | no-reply@rmt.flipkart.com | The refund amount for your ... is successfully transferred to your card | HTML: `Refund amount ₨. 1099.0`, `Bank name HDFC`, `Card number ************1830`, `will be added to your card by Nov 16, 2026`, Order ID `OD...` | expected refund ₹1,099 to HDFC card 1830, pending until credit arrives |
| F11 | bankloanalerts@kotak.bank.in | Installment Due Alert | `an Installment of Rs 34098 towards your Kotak Commercial Loan Account No. <acct> is due on 10-NOV-2026` | commitment EMI ₹34,098 due 10th |
| F12 | noreply-coin@qmailer.zerodha.net | Coin by Zerodha - Order report | `Order failed ... QUANT ELSS TAX SAVER FUND DIRECT PLAN - GROWTH Payment not initiated from client end Order value: ₹5000.0000` | SIP commitment status failed |
| F13 | billing+...@stripe.com | Reminder: Confirm your $205.32 payment to Beautiful Slides, Inc. | `Confirm your payment` | not a transaction; subscription commitment "action needed", currency USD |
| F14 | bankalerts@kotak.bank.in | Limit Modification on Kotak Card | settings change | ignored (no money movement) |
| F15 | info@sbmbank.co.in | SBM NIYO CC - Transaction OTP | OTP | ignored, never stored beyond detection |
| F16 | any marketing ("Pay Your Bills & Get ₹50 Cashback!") | promotions | — | ignored |

Ledger scenario tests:
- S1 Amazon ₹7,382: declined attempt (F2-style) + successful debit + reversal credit (F3) → net spend ₹0, one linked pair, declined excluded.
- S2 Meesho ₹138: Kotak alert + Razorpay receipt → exactly one transaction.
- S3 ₹75,000 + ₹12,000 IMPS to own ICICI → self transfers, spend unaffected.
- S4 Flipkart refunds ₹1,099 + ₹298 → two pending expected refunds; settle when HDFC credits arrive; flag overdue after 16 Nov.
- S5 Same email ingested twice → one RawEvent, one transaction.
- S6 Statement line for a GPay UPI payment with no email → new transaction from statement.
- S7 Statement reconciliation with one missing line → mismatch amount equals that line, item in review queue.

---

## 13. Environment variables to add (`.env.example` + Render)

```
# Auth
JWT_SECRET=                     # required, long random
GOOGLE_WEB_CLIENT_ID=           # same as VITE_GOOGLE_CLIENT_ID
GOOGLE_ANDROID_CLIENT_ID=       # if different
ALLOWED_EMAILS=                 # optional: emails allowed to use /api/finance

# Ingestion
INGEST_HMAC_SECRET=             # shared with the Apps Script (Script Properties)
INGEST_OWNER_EMAIL=             # Tabby user who owns ingested Gmail data
GEMINI_API_KEY=                 # already used by receipt scanner
GEMINI_MODEL=gemini-2.5-flash

# Storage & crypto
DATA_ENCRYPTION_KEY=            # 32 random bytes, base64; back it up safely — losing it = losing documents
DATA_ENCRYPTION_KEY_VERSION=1

# Jobs & alerts
JOBS_SECRET=                    # Render Cron Job sends this
ALERT_EMAIL_TO=
RESEND_API_KEY=                 # already used
APP_TIMEZONE=Asia/Kolkata
SEED_DEMO=false
```
Frontend (Netlify + GitHub Actions): `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` (already set).

---

## 14. API summary (new)

```
POST   /api/auth/google
GET    /api/finance/accounts                 POST /accounts   PATCH /accounts/:id   PUT /accounts/:id/statement-password
GET    /api/finance/transactions?month=&accountId=&categoryId=&kind=&status=&tag=&tripId=&q=&cursor=
GET    /api/finance/transactions/:id          PATCH /transactions/:id   POST /transactions (manual)
PUT    /api/finance/transactions/:id/splits    POST /transactions/:id/share   POST /transactions/:id/link
GET    /api/finance/categories                 POST / PATCH / DELETE
GET    /api/finance/rules                      POST / PATCH / DELETE
GET    /api/finance/split-templates            POST / PATCH / DELETE
GET    /api/finance/review                     POST /review/:rawEventId/confirm|ignore|ignore-sender
POST   /api/finance/ingest/email   (HMAC)      POST /ingest/manual
POST   /api/finance/statements/upload          GET /statements   GET /statements/:id/reconciliation
GET    /api/finance/policies                   POST / PATCH / DELETE   POST /policies/extract (from document)
GET    /api/finance/claims                     POST / PATCH
POST   /api/finance/documents (multipart)      GET /documents   GET /documents/:id/download   PATCH (links)   DELETE
GET    /api/finance/commitments                POST / PATCH / DELETE
GET    /api/finance/dashboard?month=
GET    /api/finance/alerts                     POST /alerts/:id/read
POST   /api/finance/jobs/run?job=   (JOBS_SECRET)
```

---

## 15. Owner setup checklist (things the code cannot do)

1. Google Cloud console: confirm the OAuth client IDs (web + Android SHA-1) used for sign-in.
2. Generate and set the new env vars on Render (§13). Back up `DATA_ENCRYPTION_KEY` somewhere safe offline.
3. Create a Render Cron Job hitting `/api/finance/jobs/run` daily at 08:00 IST (and hourly if desired). Consider a paid always-on instance to avoid cold starts.
4. Install the Apps Script in the Gmail account that receives bank alerts: paste `tools/apps-script/Code.gs`, set Script Properties, authorise, add the 10-minute trigger, run `backfill('2026-11-01', today)`.
5. In the app: add accounts (Kotak 9564 + card 2797, ICICI 1537 / 1042, ICICI CC 5002, SBM 7255, SBM Niyo CC, HDFC CC 1830, Kotak loan, Zerodha) and statement passwords.
6. Upload or confirm insurance policies.

---

## 16. Defaults to assume for open decisions (owner may override)

| Decision | Default |
|---|---|
| Users | Finance data is single-owner (per user, fully scoped). Shared expenses/trips keep Tabby's multi-user model. |
| Hosting | Keep Render + MongoDB Atlas + Netlify + Android OTA. |
| History | Start from 1 Nov 2026; backfill function available for older months. |
| Alerts | In-app + email (Resend). Push later. |
| Grocery sub-categories | The list in §5 (Category). |
| Trips | Trip-mates use existing Tabby friend/group features; external people get an exported summary. |
| AI provider | Gemini (already integrated). Never send statement passwords or full card numbers to the AI; mask account numbers except last 4 before sending. |

---

## 17. Phase checklist (copy into PR descriptions)

- [x] Phase 0 — Auth, data scoping, demo off, reliable sync, hardening, tests
- [ ] Phase 1 — Finance models, indexes, zod schemas, category seeding
- [ ] Phase 2 — Apps Script push, ingest route, parsers F1–F16, AI extraction, dedupe/refund/self-transfer, review queue, statements + reconciliation
- [ ] Phase 3 — Money tab, transactions list/detail, categories & rules, budgets, accounts
- [ ] Phase 4 — Category split, grocery auto-split, templates, share with friends
- [ ] Phase 5 — Encrypted storage, policies, claims, documents, tax view
- [ ] Phase 6 — Trips (dates, budget, linking, summary, export)
- [ ] Phase 7 — Commitments, Finance Home dashboard, jobs, alerts
- [ ] Phase 8 — Polish: performance, empty states, backups (Atlas snapshots + export), 12-month history import
