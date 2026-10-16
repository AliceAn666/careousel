# Careousel

Better care, sooner. A functional synthetic cross-clinic appointment and waitlist prototype built from scratch. No previous HTML/CSS/JavaScript frontend is used.

## Open in GitHub Codespaces

Select the `feat/batch-notifications-bilingual` branch on GitHub, then **Code → Codespaces → Create codespace**. In the repository terminal run:

```sh
bash scripts/setup-demo.sh && npm run dev
```

Then open **Ports → 3000 → Open in Browser**. The setup helper requires Node.js 22.12+ and Docker Compose (available in the standard Codespaces environment); it installs locked dependencies, generates a local session secret only when `.env` is absent, starts PostgreSQL, applies migrations and initializes only an empty local synthetic database. It preserves existing bookings. Run setup before starting the app, never while servers/tests are running. Language can be switched using **English / 中文** in the header.

## Run locally

Requirements: Node.js 22.12+ (Node 24 tested), npm, Docker with Compose. Ports 3000 and 5432 should be available.

```sh
cp .env.example .env
# Replace SESSION_SECRET in .env with a random secret of at least 32 characters.
npm ci --ignore-scripts
npm run db:generate
docker compose up -d db
npm run db:migrate
SEED_CONFIRM=RESET_SYNTHETIC_DATA npm run db:seed
npm run dev
```

Open http://localhost:3000. Choose Avery for the patient portal or Cedar Health staff for the clinic portal. Switch among all 16 synthetic personas from the sidebar or mobile header.

`--ignore-scripts` avoids Prisma's unnecessary Rust engine download in restricted environments. `db:generate` invokes the **pinned** Prisma 6.19.2 JavaScript generator through `@prisma/internals`, with no native engine download. Runtime uses Prisma's PostgreSQL driver adapter. SQL migrations run with `pg`, a transaction, a migration lock and checksum tracking. Do not run `prisma migrate dev`, `db push`, or silently edit applied SQL; add a numbered migration and update the schema together. Review generator integration when upgrading Prisma.

The database is real PostgreSQL, persisted in the `careousel_data` Docker volume. Starting/stopping the app or `docker compose down` does not erase it. **Do not use `docker compose down -v` unless you intend to delete all demo data.** Seeding is explicit and destructive; normal startup never seeds. On PowerShell set `$env:SEED_CONFIRM="RESET_SYNTHETIC_DATA"` before running `npm run db:seed`.

Production-mode local rehearsal: `npm run build && npm start`. A persistent `SESSION_SECRET` is required in production mode. Nothing is publicly deployed by these commands. Demo access is deliberately gated by `DEMO_MODE=true`; this is not production authentication.

## Five-minute demonstration

1. Start with fresh fixtures (seed command above, or staff → Demo guide → Reset demo data → type `RESET`). This affects only your configured demo database.
2. Enter as **Avery Morgan**. My appointments shows a Dermatology appointment at Harbor Medical ~28 days away.
3. Choose **Find an earlier time**, retain the default preferences, and **Join waitlist**. The original booking stays confirmed.
4. Switch to **Cedar Health staff**. In Schedule, cancel **Jordan Lee**'s booked Dermatology appointment ~7 days away.
5. Open **Waitlist matches**. The released Dermatology slot is selected first. Review Avery's eligibility; use **Explain recommendations** to see the local rules fallback. Approve Avery and enter a review reason.
6. Switch to Avery → Notifications. Accept the earlier appointment and confirm the replacement.
7. My appointments shows Cedar confirmed and Harbor rescheduled. My waitlist is fulfilled. Refresh, switch staff personas, or restart the app to verify persistence. Harbor's old slot is available again.

Try declining instead: the original booking and active request remain, and the slot is released. Offers expire after 10 minutes according to server time. An expired invitation cannot confirm a slot, even if the browser was closed. A patient who declined a specific slot is excluded from repeat offers for that slot. Use two independent browser sessions for simultaneous patient/staff demonstrations. Rehearse from reset before judging; do not reset a shared session during another person's demo.

## Working features

- Responsive patient and staff workspaces, demo persona sessions and clinic-scoped access.
- Combined specialty, location, demo insurance, maximum estimated cost and appointment-date filters; clinic/slot details and confirmation dialog.
- Direct booking, cancellation, appointment history, linked/unlinked waitlists, date/hour/weekday/budget/plan/clinic preferences, edits and withdrawal.
- Automatic persistent eligibility suggestions, FIFO ordering, staff approval and exclusive 10-minute offers.
- Database-backed in-app inbox with read state, acceptance, rejection and server-time expiry; 12-second polling plus immediate refresh after mutations.
- Atomic cross-clinic replacement, rollback protection, idempotent retries, overlap checks, unique booking/offer constraints and audit history.
- Staff date-filtered schedules, new 30-minute openings, cancellations, match explanations and guarded demo reset.
- Four clinics, nine service categories, four insurance plans plus self-pay, twelve patients, four staff and eighty slots with future relative dates.

The clinic-detail and booking-review experiences are dialogs within Find care rather than separate standalone pages. The old patient/symptom record editor is intentionally absent. No real health records or contact data are collected.

## AI assistance with reliable fallback

The server always performs hard eligibility checks and FIFO ordering. **Explain recommendations** summarizes eligible matches; it never changes ranking, bypasses constraints or sends offers. Staff approval is mandatory. No clinical urgency is inferred.

Without credentials, local explanations are fully functional and clearly labeled. To optionally enable an OpenAI-compatible chat-completions provider, configure `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL` in `.env`. Only anonymous candidate numbers and administrative eligibility reasons are sent, never patient names. Timeout (5 seconds), unavailable provider, bad status or malformed output falls back to local explanations. Model output remains advisory and must be reviewed. External provider access depends on your environment's network policy; no real provider was configured or called during development.

## Tests

Tests intentionally refuse to run without a separate `TEST_DATABASE_URL` naming `careousel_test`. Never point tests at a shared demo database.

```sh
npm run db:test:prepare
npm run lint
npm run typecheck
npm test
npm run test:integration
# If Chromium is not installed:
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:persistence
```

Browser tests use a separate app on port 3100 and the isolated test database. A system `/usr/bin/chromium` is used when present; otherwise Playwright's installed Chromium is used. Override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed. Do not run integration, browser, or persistence suites concurrently against the same test database. The persistence test starts a production server on port 3200, books via the API, restarts that server, and verifies the database-backed booking and session survive. Stop your development server before running browser tests from the same checkout, because Next.js permits one development server per checkout.

See [PRD.md](PRD.md), [AGENTS.md](AGENTS.md), [TASKS.md](TASKS.md), and [VALIDATION.md](VALIDATION.md) for scope, collaboration and verification evidence.

## Architecture and team handoff

- `src/app/api`: thin JSON route handlers; `/api/state` returns the role-scoped snapshot; `/api/actions` validates scheduling mutations; `/api/session` gates demo personas; `/api/recommendations` provides explanations.
- `src/server/services`: transactions, matching, expiry and optional provider adapter. All scheduling reads/writes take the same PostgreSQL transaction-scoped advisory lock. This intentionally serializes the small demo workload. Scale later with consistent patient/slot locking; do not remove the lock without concurrency tests.
- `src/server/auth`: signed HTTP-only sessions, 24-hour expiry and same-origin mutation checks.
- `src/components`: freshly built React interface; `src/lib`: shared money/time formatting, configuration and serialized types.
- `prisma/schema.prisma` + `prisma/migrations`: models and reviewed SQL, including partial unique indexes.
- `tests`: domain, PostgreSQL integration and browser workflows.

Suggested next PR ownership: Member 1 schema/migration/CI integration; Member 2 patient UX; Member 3 clinic UX; Member 4 scheduling and matching rules; Member 5 acceptance coverage and rehearsals. Coordinate shared files, keep PRs small and require review. This implementation PR is for review and has not been merged automatically.

## Deliberate limits

Synthetic data only; insurance matching and prices are demonstrations, with no real verification, billing or payment. In-app notifications are real; SMS/email are not connected. No production identity, autonomous clinical triage, EHR integration, geocoding, travel buffer, or public deployment. Staff-created visits use an explicit provider, duration and accepted demo plans. All seeded clinics use America/Los_Angeles. Local explanations and a mocked provider adapter are tested; external AI availability is not required or claimed.

UI uses original CSS and Lucide icons rather than adding Tailwind/shadcn during this milestone. No remote fonts or images are required. Core dependencies use permissive licenses (Next/React/Lucide/Zod/pg: MIT or ISC; Prisma: Apache-2.0); preserve installed package notices when redistributing.

## Group notifications, languages and expanded services

Use **English / 中文** in the page header to switch language. The choice persists across refreshes; Chinese browsers default to Chinese. UI labels, statuses, standard errors, notifications, matching reasons and date displays are localized. Names, addresses, staff-entered notes and external AI prose remain as supplied. Appointment dates remain in the clinic demo's Pacific timezone; changing language does not change timezones or insurance eligibility.

In **Waitlist matches → Notify in groups**, assign each eligible patient to **Priority group**, **General group**, or **Not included**. Enter the response window (1–60 minutes, default 10) and a review reason, then choose **Approve & start groups**. All patients in a group receive an in-app invitation together. If everyone declines or the group's deadline expires, the next approved group is notified automatically. The first eligible confirmation succeeds; competing invitations are revoked, and other patients keep their original bookings. Staff choose priority; AI never infers medical urgency. Each later group is revalidated before sending. Plans and deadlines are persisted, can be cancelled by the owning clinic, and recover after restart. An empty or no-longer-eligible group is skipped.

`npm run dev` and `npm start` now run both Next.js and a notification worker. The worker checks due transitions every five seconds, including when browsers are closed. API reads/mutations also reconcile overdue state under the same database lock; correctness never depends on a browser timer. Start through these npm scripts for automatic notifications. Invitations are still **in-app only**, not SMS/email. The group window ends at appointment start if that is earlier than the configured deadline.

Nine synthetic service categories are available: Dermatology, Cardiology, Primary care, Vaccination, Health screening, Physical therapy, Vision care, Dental checkup and Nutrition consultation. New openings support provider name, 10–180 minute duration and explicitly accepted demo plans. These labels do not establish real clinical qualification or insurance verification. The full fixture set now has 80 slots across the existing four clinics. Existing local demo databases can receive the 24 extra slots without reset using:

```sh
node --import tsx scripts/add-expanded-services.ts
```

The helper is limited to the local synthetic `careousel` database and is idempotent. It preserves existing slots/bookings. Apply migration `0003_notification_batches` with `npm run db:migrate`; do not edit earlier migrations. It adds persistent group plans and permits multiple pending invitations only within the same approved batch; confirmed booking uniqueness remains unchanged.

中文操作：切换为诊所前台 → 候补匹配 → 选择空位 → 为患者选择优先组或普通组 → 设置等待分钟数并填写审核理由 → 批准并开始分组通知。所有组都无人接受后，号源恢复为可直接预约。语言切换和新增服务均可在手机上使用。
