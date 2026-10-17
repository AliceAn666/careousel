# Careousel

Better care, sooner. A functional synthetic cross-clinic appointment and waitlist prototype built from scratch. No previous HTML/CSS/JavaScript frontend is used.

## Automated priority-group notifications (Phase 7)

Clinic Waitlist matches now provides **Automatic priority-group notifications**: select an opening, preview P1–P4 and exclusions, explicitly select recipients, confirm the first group and reason, then **Authorize and start automatic sequence**. Later groups send automatically at least 180 minutes after the previous actual send, including when earlier patients have not responded. One shared cross-clinic pool; no internal-clinic-first window. Use Pause / Resume / Cancel; changed recipient/priority snapshots require fresh preview and explicit reauthorization of unsent groups.

Start a separate local worker alongside the web app:

```sh
npm run worker:notifications
# Alternatively invoke one durable processing pass from a supervised scheduler:
npm run worker:notifications -- --once
```

The worker polls PostgreSQL every 15 seconds; use a process supervisor/cron in the chosen runtime. Sequences persist through restarts and overdue work recovers after the worker returns; app startup alone does not start a worker. No browser must remain open. Group invitations are real in-app database notifications, not external email/SMS. All groups compete for one remaining appointment; only a committed acceptance fills it, terminates scheduled sends and preserves losing patients' originals.

Apply reviewed new migrations **0006_automated_notifications** and **0007_notification_sequence_history** only to a separately authorized target; existing applied migrations are unchanged. No shared demo rollout is performed by this PR. [Operational guide and isolated demonstration](docs/automated-notifications.md) · [Verification](VALIDATION.md).

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

Open http://localhost:3000. Use **Find Care** for the patient demo (Avery by default), or **For Clinics / Open clinic demo** for the clinic workspace (Cedar by default). A same-role entrance resumes this browser's existing identity. The switcher exposes four demo personas (Avery, Jordan, Cedar staff and Harbor staff). Other synthetic records remain in the database.

`--ignore-scripts` avoids Prisma's unnecessary Rust engine download in restricted environments. `db:generate` invokes the **pinned** Prisma 6.19.2 JavaScript generator through `@prisma/internals`, with no native engine download. Runtime uses Prisma's PostgreSQL driver adapter. SQL migrations run with `pg`, a transaction, a migration lock and checksum tracking. Do not run `prisma migrate dev`, `db push`, or silently edit applied SQL; add a numbered migration and update the schema together. Review generator integration when upgrading Prisma.

The database is real PostgreSQL, persisted in the `careousel_data` Docker volume. Starting/stopping the app or `docker compose down` does not erase it. **Do not use `docker compose down -v` unless you intend to delete all demo data.** Seeding is explicit and destructive; normal startup never seeds. On PowerShell set `$env:SEED_CONFIRM="RESET_SYNTHETIC_DATA"` before running `npm run db:seed`.

Production-mode local rehearsal: `npm run build && npm start`. A persistent `SESSION_SECRET` is required in production mode. Nothing is publicly deployed by these commands. Demo access is deliberately gated by `DEMO_MODE=true`; this is not production authentication.

## Five-minute demonstration

1. Use an already initialized synthetic database. Only when deliberately starting a new rehearsal, open `/demo` as staff → Reset demo data → type `RESET`. This clears shared demo actions: never do it while another browser is presenting. Startup, homepage entry, login and persona switching preserve data.
2. Choose **Find Care** to enter as **Avery Morgan** (or explicitly choose Avery under Other demo personas if resuming a different patient). On first entry, complete the synthetic intake (e.g. Skin problem), submit, then Continue to find care. My appointments becomes enabled and shows the Harbor Medical Dermatology booking ~28 days away. Do not enter real health information.
3. Choose **Join a waitlist** from Find care or the combined My appointments page. Select the Harbor booking under **Existing appointment to replace (optional)**, retain suitable preferences and Join waitlist. The original booking stays confirmed. Without this explicit link, a request does not replace an existing booking.
4. In a separate browser/profile, choose **Open clinic demo** to enter as **Cedar Health staff** (or use the persona switcher in a single-browser rehearsal). In Schedule, cancel **Jordan Lee**'s booked Dermatology appointment ~7 days away.
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
- Four clinics, three specialties, four insurance plans plus self-pay, twelve patients, four staff and fifty slots with future relative dates.

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

Synthetic data only; insurance matching and prices are demonstrations, with no real verification, billing or payment. In-app notifications are real; SMS/email are not connected. No production identity, autonomous clinical triage, EHR integration, geocoding, travel buffer, or public deployment. New staff-created visits are 30 minutes with a seeded provider. All seeded clinics use America/Los_Angeles. Local explanations and a mocked provider adapter are tested; external AI availability is not required or claimed.

UI uses original CSS and Lucide icons rather than adding Tailwind/shadcn during this milestone. No remote fonts or images are required. Core dependencies use permissive licenses (Next/React/Lucide/Zod/pg: MIT or ISC; Prisma: Apache-2.0); preserve installed package notices when redistributing.

## Final integration

Current owner is the user working with Codex. See [docs/final-integration.md](docs/final-integration.md) for actual CI diagnosis, inspected branch heads, safe migration convergence and subsequent integration gates. No optional branch has been merged by Phase 1.

## Phase 2: proposal and public home

The October 14 business proposal is the product requirements source of truth in PRD.md, with requirement/task/acceptance traceability. TASKS.md and AGENTS.md use the user + Codex ownership model. Phase 2 selectively adapts PR #5/#6 onto the CI-verified post-PR #8 main; it does not integrate registration, group notifications, insurance tours or database changes. The current base has no registration endpoint. Public home is reachable through the workspace home buttons even with an active session; it never invokes Reset Demo.

## Patient guide and fictional insurance comparison (Phase 3)

Complete the synthetic first-visit intake first, then use **Start patient guide** or **Quick tour**. Next/Back visits the current calendar, insurance comparison, combined appointments/waitlists and inbox. Close or Escape to try a screen; reopen to resume. Finish resets only guide progress so it can be replayed. Clinic guidance uses schedule, matches and priorities. It never changes appointments.

In Find care, choose a fictional insurer and PPO/HMO. Optionally show only in-network demo scenarios or cap the **estimated patient cost**. The existing **Maximum cost** still limits the full listed price. HMO examples have a narrower fictional network and exclude Cardiology; PPO examples apply a fictional $50 remaining deductible then 20% coinsurance. These rules are illustrative, not verified benefits. Open a calendar time for a cent-accurate estimate and exclusions/limitations. Booking uses the persona's saved demo plan; browsing another insurer does not change it or verify coverage.

Search preferences and guide progress are stored only in this browser, separately for each synthetic persona. Navigation, refresh and returning home preserve identity and database state. Corrupt/blocked browser storage falls back safely; cross-device preference synchronization is not provided. No real patient information, plan identifiers or payments should be entered.

## Four-level request priorities (R1 feature branch)

In the clinic portal, open **Priorities** to review a specific waitlist request, choose **P1 — Time-Sensitive**, **P2 — High Priority**, **P3 — Routine** or **P4 — Flexible**, and enter a synthetic review reason. Save records the staff decision and history; it sends no invitation. Filter by group, reopen history, or inspect the label in Waitlist matches. Patients see each clinic's decision on their own request in My appointments. Different requests/clinics remain independent; editing preferences requires staff re-review.

Legacy questionnaire/tag rows are retained; no score is automatically mapped to clinical urgency. R1 originally used pre-authorized synthetic sessions; this R3/R4 branch now adds individual accounts while actual hospital verification remains simulated. FIFO matching and exclusive staff-approved invitations remain unchanged; three-hour group invitations are a later feature PR.

New additive migration: `0004_waitlist_priority_levels`. It creates request priority/history tables and conservatively backfills explicitly associated requests as awaiting review, without deleting existing data or granting priority. Apply migrations only to an explicitly chosen database after reviewing the rollout; **do not reset, reseed or migrate the shared demo without separate approval**. The implementation was tested in its own PostgreSQL database; no shared database upgrade was performed.

## Individual accounts and clinic access (R3/R4 branch)

Normal home now offers **Patient Login** / **Clinic Staff Login**. Patient signup creates a patient account only, with a fictional display name and reserved example/test email. Log out before authenticating another account. Completing the existing synthetic intake unlocks appointment/calendar/waitlist flows. Home and refresh retain the account; names/roles are visible and normal workspaces have no persona selector. **Enter Demo Mode** explicitly enables the synthetic personas; account sessions must log out first. Existing signed demo sessions remain supported while DEMO_MODE=true. No navigation resets data.

Clinic staff need a mock institution-controlled invitation and administrator approval. An administrator opens **Staff access**, creates a mock invitation, copies the one-time token, approves the registered pending staff member, and can revoke access. No email is sent and actual hospital employment/email ownership is not verified. Revoked staff can use a fresh same-clinic invitation and existing credentials to request re-enrollment; administrator approval is required again and old sessions stay revoked. Invitations bind to the specified fictional email and clinic; an employee ID cannot create privileges.

Additive migration: 0005_accounts_clinic_access; no automatic accounts/roles or existing-record rewrites. Review/apply it only to an explicitly approved database before running this branch. Initial mock clinic administrator setup is a trusted local operation (no public signup): set ADMIN_BOOTSTRAP_CLINIC, ADMIN_BOOTSTRAP_USERNAME, ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_NAME and ADMIN_BOOTSTRAP_PASSWORD in the shell, then run `node --import tsx scripts/provision-mock-admin.ts --confirm-mock-bootstrap` against the reviewed target DATABASE_URL with DEMO_MODE=true. Do not run against shared data without separate authorization; do not paste credentials in chat or commit them. Existing clinic bookings are untouched.

Prototype limits: one role/clinic per staff account, no password recovery/MFA/admin transfer UI or real institution verification. Phase 7 adds automatic three-hour group invitations after one staff authorization; legacy exclusive invitations and atomic replacement remain functional. Confirmed Demo Mode Reset clears synthetic registered accounts and sessions as well as other demo actions; it is not available to normal account sessions and is never automatic.
