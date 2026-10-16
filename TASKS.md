# Careousel development roadmap

Status: Application implementation explicitly approved on 2026-10-16. Work is on `feat/careousel-prototype`, based on latest main after the intentional frontend deletion. Public deployment still requires separate authorization. See the implementation ledger below and VALIDATION.md; unchecked original tasks remain release/handoff gates rather than a claim that no application exists.

## Suggested five-person responsibilities

| Member                   | Primary ownership                                                                          | Review partner / secondary work                         |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 1 — integration and data | App bootstrap, schema, migrations, domain contracts, CI and integration                    | Reviews Member 4; coordinates shared-file changes       |
| 2 — patient experience   | Search, clinic details, direct booking, appointment and waitlist UI                        | Reviews Member 3; accessibility and mobile checks       |
| 3 — clinic experience    | Schedule, cancellation, candidate review and activity UI                                   | Reviews Member 2; synthetic fixture design              |
| 4 — scheduling engine    | Booking transactions, eligibility, ranking, offers, rescheduling, inbox services           | Reviews Member 1; database concurrency tests            |
| 5 — quality and demo     | Session/authorization integration, seed/reset, browser tests, demo guide and visual review | Reviews critical flows with Member 4; release rehearsal |

These are ownership areas for students, not instructions to spawn agents. Names, availability, deadline and experience are unresolved. No owner works in isolation: service contracts and a shared vertical slice come before broad parallel UI development. Member 1 integrates migrations; Member 5 coordinates demo evidence.

## Dependency path

`M0 approval -> M1 foundation/contracts -> M2 cancellation-to-confirmation vertical slice -> M3 full P0 portals -> M4 hardening/rehearsal -> M5 approved demo release`

After M1, Members 2 and 3 can develop UI against agreed typed contracts while Members 1, 4 and 5 complete persistent services and integration tests. Temporary fixture adapters must be explicitly marked and replaced before a task is accepted. No mock-only page counts as completed P0 functionality.

## M0 — approve scope and decisions

Owner: entire team. Dependencies: none. Deliverables: reviewed planning documents and agreed scope.

- [ ] Review PRD assumptions D01–D10, especially stack, demo personas, approval ordering, ten-minute offer holds, geography and waitlist uniqueness.
- [ ] Confirm hackathon deadline, actual owners and must-show scenario; choose a feature freeze time.
- [x] Obtain user approval before application implementation or dependency installation.
- [ ] Record hosting constraints and local demo fallback; do not deploy in this milestone.

Gate: implementation authorization is explicit; unresolved nonblocking decisions have named owners and defaults.

## M1 — foundation, contracts and persistent schema

Lead: Member 1. Partners: Members 4 and 5. Depends on M0.

- [ ] Bootstrap the approved framework and compatible stable dependency versions; commit npm lockfile; document runtime requirements.
- [ ] Establish shared layout, theme tokens, accessible components, consistent statuses, timezone/money formatting and error conventions (Members 2/3).
- [ ] Design Prisma schema and reviewed SQL constraints for slot occupancy, pending offers and active waitlist uniqueness; define patient/slot locking order (Members 1/4).
- [ ] Define route/input/output contracts for search, bookings, cancellation, waitlists, matching, approval, offer response, inbox and demo reset. Specify authorization and conflict responses (Members 1/4/5).
- [ ] Establish PostgreSQL development/test setup, migrations, explicit seed command, placeholder environment documentation and independent test database.
- [ ] Implement signed-cookie seeded sessions, clinic memberships, same-origin mutation protection and demo-mode gates (Member 5, review Member 1).
- [ ] Establish lint, typecheck, unit/integration/browser scripts and build; configure PR CI and branch protections where permissions permit.
- [ ] Check licenses for adopted packages/assets and retain required notices.

Deliverables: bootable app, durable database, shared contracts, migration history, minimal seeded roles, test harness and setup instructions.

Gate: fresh setup/migration works; server authorization is tested; constraints and locking strategy are reviewed; main builds. No feature team invents separate domain states or schemas.

## M2 — one complete persistent vertical slice

Lead: Member 4. All members contribute. Depends on M1. Highest implementation priority.

- [ ] Seed Avery's later Harbor booking, Cedar's earlier occupied slot, one eligible request and explicit incompatible candidates (Members 3/5).
- [ ] Implement waitlist creation linked to an existing booking without cancelling it (Member 4; Member 2 UI).
- [ ] Implement cancellation transaction, released availability and deterministic eligibility suggestions (Member 4; Member 3 UI).
- [ ] Implement staff review/approval, exclusive hold and persistent notification, with revalidation (Members 4/3).
- [ ] Implement inbox and patient accept/decline endpoints and minimal usable UI (Members 4/2).
- [ ] Implement atomic cross-clinic replacement, history and release of the original slot; verify clinic-scoped visibility (Members 4/1/5).
- [ ] Enforce expiry on reads/mutations and expose a stale offer response; support retrying candidate generation (Member 4).
- [ ] Add browser journey and PostgreSQL tests for the entire slice, including rollback and competing acceptance/approval (Member 5 with Member 4).

Deliverable: PRD workflow B runs through real UI and services without manual database edits.

Gate: AC03–AC08, AC14 and AC15 pass for the slice; refresh and app restart preserve changes; original booking survives every failed replacement. Merge this before adding optional pages.

## M3 — complete the P0 patient and clinic portals

Depends on M1 contracts and M2 services. Leads: Members 2 and 3; backend support Member 4.

### Patient workstream — Member 2

- [ ] Build search with combined specialty/service, city/area, plan, maximum estimated cost and date availability filters.
- [ ] Build clinic/slot details and booking review with demo insurance/price labels.
- [ ] Integrate direct booking and appointment cancellation with helpful concurrency conflicts.
- [ ] Complete appointment history and waitlists, including unlinked requests, edit and withdraw.
- [ ] Complete inbox with read/unread state, offer expiry, explicit acceptance consequences and result views.
- [ ] Provide responsive navigation, keyboard operation, validation, loading, empty and failure states.

### Clinic workstream — Member 3

- [ ] Build date-filtered schedule and booking details, future-slot creation/release and cancellation confirmation.
- [ ] Build clinic-scoped waitlist/candidate review with eligibility explanations and staff selection reason.
- [ ] Show approved holds, no-match availability, expired/declined offers and next-candidate review.
- [ ] Add scoped activity history and schedule updates after every committed action.
- [ ] Ensure staff cannot view or modify unrelated clinic records via UI or direct requests.

### Shared services/data — Members 1, 4 and 5

- [ ] Complete search queries and indexes and all service contracts used by portals.
- [ ] Enforce patient overlap prevention, earlier-only replacement, idempotent requests and invalidation when preferences/bookings change.
- [ ] Expand synthetic seed to PRD minimums and edge cases; use relative dates and example-domain contacts.
- [ ] Add explicit privileged demo reset with confirmation, transactional baseline and demo-mode restriction; startup never resets.

Deliverables: all P0 pages backed by persistence and full synthetic dataset.

Gate: AC01–AC15 have implementation and meaningful verification; no required flow depends on a temporary mock adapter.

## M4 — harden and rehearse

Lead: Member 5. Reviewers: all. Depends on M2/M3. Freeze P1/P2 until this gate passes.

- [ ] Verify combined search filtering and all eligibility exclusions, stable tie ordering, boundary times and adjacent versus overlapping bookings.
- [ ] Run PostgreSQL races for one slot, one patient across slots, two staff approvals, repeated acceptance, stale offers and duplicate notifications.
- [ ] Test rollback injection, expiry without background worker, withdrawal/preference changes, linked-booking cancellation and no-match recovery.
- [ ] Verify role/ownership isolation through direct server calls, not just hidden UI controls.
- [ ] Verify refresh/restart persistence, explicit reset, future seed dates and demo tools disabled outside demo mode.
- [ ] Run Playwright main journey, direct booking, decline and expiry; record outcomes against AC01–AC15.
- [ ] Review keyboard access, contrast, 375px patient flow, status labels and demo insurance/payment wording.
- [ ] Run full CI checks/build from clean setup; document exact run/migrate/seed/test commands and prerequisites.
- [ ] Create a five-minute demo script with personas, expected state after each action, reset procedure, common conflict recovery and local fallback.
- [ ] Rehearse twice from reset using the same code/database arrangement intended for judging.

Deliverables: passing checks, acceptance matrix, setup and demo guide, known limitations, stable demo baseline.

Gate: main journey succeeds twice, critical integrity/authorization issues are resolved, and all P0 acceptance criteria have evidence. If time is short, cut enhancements rather than transaction safety.

## M5 — release preparation and optional deployment

Lead: Members 1/5. Depends on M4. Hosting remains unresolved; no deployment is currently authorized.

- [ ] Select hosting only after confirming persistent PostgreSQL, supported runtime, migrations, secrets and budget; retain tested local fallback.
- [ ] Prepare a concrete release/deployment plan with demo-mode controls, reset policy and rollback procedure.
- [ ] Obtain explicit deployment authorization before publishing or modifying hosting.
- [ ] If authorized, deploy the tested build, apply reviewed migrations/seed to the intended demo database and smoke-test role switching and the main journey.
- [ ] Tag a stable revision, stop risky changes before judging, and prepare local run instructions and screenshots as supporting material.

Deliverable: approved, rehearsed demo environment; a local environment is sufficient if deployment is not selected.

## Optional backlog — only after P0 acceptance

- [ ] P1: richer calendar view and days-saved/utilization metrics from persisted events (Member 3).
- [ ] P1: expanded candidate explanations and clinic filters (Members 3/4).
- [ ] P1: richer visibly simulated insurance/payment experience without real credentials (Member 2).
- [ ] P2: calendar export, maps, realtime push or external notification adapter, chosen only if time and authorization permit.

## PR handoff and definition of done

Every task PR states the behavior, related PRD acceptance IDs, database/API changes, relevant verification results and limitations. Include screenshots for material UI changes and migration notes for schema changes. Require a review partner and successful applicable checks before merge. Coordinate schema/lockfile/shared configuration edits with Member 1. Actual branch protections may depend on repository permissions; do not claim they exist until verified.

Done means persisted behavior works through the interface, server authorization and domain invariants hold, meaningful tests pass, error/empty states exist, synthetic labeling is clear, and documentation reflects the result. Document-only completion for this initial task means the three documents are consistent and ready for user review; it does not imply any application capability is built.

## Implementation ledger — initial prototype PR

The original milestones remain the target roadmap. This ledger distinguishes delivered code from human review/release gates; actual test counts belong in VALIDATION.md.

### Foundation

- [x] Create a clean Next.js/React/TypeScript app on a dedicated branch without the old frontend.
- [x] Install dependencies and commit a lockfile; pin Prisma packages together.
- [x] Start real PostgreSQL with a durable local Docker volume; apply checksum-tracked SQL migrations and explicit synthetic seed.
- [x] Implement server-issued signed demo sessions, patient ownership, clinic-scoped actions and same-origin checks.
- [x] Add separate guarded test database, unit/integration/browser harnesses and a GitHub Actions workflow.
- [ ] Have another team member review schema/API contracts and configure repository branch protection.

### Functional slice and portals

- [x] Implement direct booking, cancellation and confirmed-booking overlap protection.
- [x] Implement linked/unlinked waitlists with date, time, weekday, location, clinic, budget and demo-plan preferences; edit/withdraw.
- [x] Generate and persist eligibility suggestions; display FIFO ranking and reasons.
- [x] Implement staff approval, exclusive offer hold, persistent inbox and accept/decline/expiry.
- [x] Implement atomic cross-clinic replacement, rollback, retry protection, audit and release of original slot.
- [x] Build original responsive patient and staff workspaces, combined search filters, slot details/review, schedules and activity.
- [x] Provide local recommendation explanations plus optional AI adapter with timeout/error fallback.
- [x] Seed 4 clinics, 3 specialties, 12 patients, 4 staff, 4 plans plus self-pay and 50 future slots.
- [x] Add explicit privileged demo reset and README walkthrough/run instructions.
- [ ] Expand dedicated fixtures for ranking ties, pre-existing expired offers and all advanced edge cases in the original PRD.

### Quality and release

- [x] Record final validation results and remaining gaps in VALIDATION.md.
- [ ] Complete two team-led rehearsals and keyboard/screen-reader review across all pages.
- [ ] Obtain reviewer approval and merge the implementation PR.
- [ ] Confirm deadline, assign actual five-person owners and choose feature freeze.
- [ ] Select hosting and obtain separate public-deployment approval if desired.

Suggested next ownership remains: Member 1 data/CI; Member 2 patient UI; Member 3 clinic UI; Member 4 scheduling/AI adapter; Member 5 acceptance and rehearsal. This implementation does not invoke parallel agents.
