# Careousel — persistent Codex instructions

## Current authorization

The user now owns all development with Codex. Phase 1 is authorized on `feat/final-integration` from latest main: repair baseline CI and unsafe demo resets, preserve existing functionality, test with an isolated database and create a review PR targeting main. Do not rebuild, assign tasks to teammates, merge optional branches yet, push to main, reset/reseed the shared demo database or deploy publicly. Preserve every existing dirty worktree. See `docs/final-integration.md` for inspected refs, CI evidence and subsequent integration gates.

## Read first

- `PRD.md` defines product scope, workflows, state rules, acceptance criteria and unresolved decisions.
- `TASKS.md` defines milestone dependencies, suggested ownership and completion gates.
- Inspect the repository and relevant existing code before editing. Preserve others' changes. Follow later explicit user instructions over this file.
- Report material scope changes and keep documents consistent with the implementation. Never claim a proposed dependency or feature already exists.

## Architecture after approval

Implemented baseline: Next.js App Router, React, strict TypeScript, original responsive CSS, Lucide, PostgreSQL, Prisma with the JavaScript pg adapter, Zod, npm, Vitest and Playwright. Tailwind/shadcn are deferred. Versions are locked in package-lock.json. Do not introduce a second framework, ORM, package manager, database, or state library without a concrete need and documented decision.

Keep UI in `src/app`/`src/components`, domain behavior in `src/server/services`, authorization in `src/server/auth`, shared schemas/utilities in `src/lib`, schema/migrations/seeds in `prisma`, and tests in `tests`. Server routes should be thin. Do not access Prisma from browser components. Use one shared Prisma client pattern appropriate for Next.js development. Keep server-only secrets and modules outside client bundles.

## Coding conventions

- Strict TypeScript; avoid `any`, unchecked assertions and ignored errors. Use explicit domain types and validated request schemas.
- PascalCase components/types, camelCase functions/variables, clear route and file names following framework conventions. Favor small focused modules over generic abstraction.
- Reuse shared form, status, money and date components. Centralize state enums, offer lifetime and demo configuration.
- Store time in UTC, display clinic IANA timezone, use integer cents and explicit currency. Inject clocks into time-sensitive services/tests.
- Validate and authorize every server operation. Return consistent validation, unauthorized, forbidden, not-found and conflict errors without internal details.
- Handle loading, empty, error, success and stale-data states. Revalidate or refresh views after committed changes; do not fake success locally.
- Use accessible labels, focus management, keyboard navigation and non-color-only statuses. Follow the shared visual system and responsive patient flows.

## Scheduling correctness

The PRD state model is authoritative. All booking, cancellation, approval, expiry and offer acceptance transitions belong in domain services with transactions and database constraints. The current demo deliberately serializes all scheduling reads/writes with PostgreSQL advisory lock 728194. Do not remove or bypass this lock without replacing it with tested patient/slot serialization.

- At most one confirmed booking or active hold per slot. Prevent patient overlap across slots with patient-level transactional serialization.
- Recheck eligibility, ownership, current state and server-time expiry at mutation time.
- Accepting a replacement must atomically confirm the new booking, reschedule the old booking, fulfill the waitlist, update offers/slots and record notifications/audit; rollback preserves the old booking.
- Retries and double clicks must be idempotent. Acquire locks consistently and test races against actual PostgreSQL.
- A suggestion does not reserve capacity. Staff approval precedes a patient offer. No automatic clinical urgency inference or confirmation.
- Explicitly handle withdrawal, preference edits, stale offers, cancellation of linked bookings, decline, expiration, and release of the replaced slot.
- Never rely on polling, browser timers or an always-running worker to preserve correctness.
- Home navigation, refresh, login, registration and persona switching must never reseed shared data. Reset is a separate signed-staff, DEMO_MODE-only action requiring literal RESET confirmation. Test independent patient/staff browser sessions.

## Demo security and data

Use invented identities and reserved example contact domains only. Never ingest real patient data or medical records. Label demo insurance and payment behavior; never request actual payment credentials. No secrets in Git, logs, screenshots or browser bundles; document environment variable names with placeholders only.

Use server-issued demo sessions and enforce patient ownership and clinic membership on every read and mutation. Do not trust client-selected roles or IDs. Gate persona switching and confirmed reset behind explicit demo mode, and reset behind server authorization. Protect cookie-based mutations against CSRF. Do not claim production security, regulatory compliance, insurance verification or real clinical prioritization.

Committed changes must persist across app restarts. Ordinary startup must not reseed or reset the database. Use reviewed migrations; coordinate schema ownership and never reset a shared database casually. Run `npm run db:migrate` (checksum-tracked SQL), not `prisma migrate dev` or `db push`. Prisma 6.19.2 packages are pinned together; `npm run db:generate` uses its pinned generator API without unused Rust downloads. Review this integration before upgrades.

## Verification after approval

Available scripts: `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, and `build`. Use `npm run db:test:prepare` to prepare the explicitly isolated careousel_test database.

- Domain tests: each eligibility exclusion, FIFO/ties, earlier-only rule, intervals, offer expiry and transitions.
- PostgreSQL integration tests: direct booking races, concurrent approvals, patient overlap, idempotency, rollback, rescheduling, authorization and expired/stale offers.
- Browser tests: the complete PRD workflow B, direct booking, decline and expiry, meaningful error feedback, refresh persistence, and role isolation.
- Use an isolated test database. Refuse destructive test/reset commands against an unrecognized/shared database. Use controlled clocks instead of sleeps.
- Every behavioral PR runs relevant tests plus lint/typecheck. Main-branch CI must run the full defined checks including build and isolated database/browser tests before release.
- Do not add tests that merely mirror markup or implementation. Documentation-only changes require consistency review, not installing/running the application.
- Report what ran, results and limitations accurately; never mark unexecuted checks passed.

## Independent development and GitHub workflow

The user and Codex are the sole owners. Earlier five-person task assignments are superseded. Do not ask the user to contact teammates or spawn agents. Use short-lived feature/fix branches and review PRs; no direct main push or automatic merge. Keep migration/API changes coordinated within each small PR. Record test evidence and limitations. No reset, reseed or migration of the shared database without separate explicit authorization; preserve applied migration checksums and use additive reviewed changes.

## Completion reporting

Summarize behavior changed, relevant tests and remaining risks after each milestone. Keep task statuses honest and record verification in VALIDATION.md. If blocked, complete independent authorized work and identify the exact blocker. Implementation is authorized; public deployment is not.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
