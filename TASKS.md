# Careousel development roadmap

Status: Application implementation approved on 2026-10-16. Foundation implementation is in review; public deployment requires separate authorization. Schema work is owned by PR #2 and remains separate. M1 is not fully complete: persistence, sessions and business integration remain outstanding.

## Suggested five-person responsibilities

| Member | Primary ownership | Review partner / secondary work |
| --- | --- | --- |
| 1 — architecture/integration (project coordinator) | Bootstrap, shared contracts, UI system, tooling and integration | Coordinates shared files and reviews integration |
| 2 — database | Prisma schema, constraints, migrations and seeds; PR #2 | Reviews persistence and transaction design |
| 3 — Patient Portal | Patient routes and components | Reviews accessibility and patient contracts |
| 4 — Clinic Dashboard | Clinic routes and components | Reviews clinic isolation and staff contracts |
| 5 — backend services | Booking, waitlist, matching, offers and authorization integration | Coordinates concurrency and workflow tests |


These are ownership areas for students, not instructions to spawn agents. Names, availability, deadline and experience are unresolved. No owner works in isolation: service contracts and a shared vertical slice come before broad parallel UI development. Member 1 integrates migrations; Member 5 coordinates demo evidence.

## Dependency path

`M0 approval -> M1 foundation/contracts -> M2 cancellation-to-confirmation vertical slice -> M3 full P0 portals -> M4 hardening/rehearsal -> M5 approved demo release`

After M1, Patient Portal and Clinic Dashboard owners can develop UI against agreed typed contracts while database/backend/integration owners complete persistent services and integration tests. Temporary fixture adapters must be explicitly marked and replaced before a task is accepted. No mock-only page counts as completed P0 functionality.

## M0 — approve scope and decisions

Owner: entire team. Dependencies: none. Deliverables: reviewed planning documents and agreed scope.

- [ ] Review PRD assumptions D01–D10, especially stack, demo personas, approval ordering, ten-minute offer holds, geography and waitlist uniqueness.
- [ ] Confirm hackathon deadline, actual owners and must-show scenario; choose a feature freeze time.
- [x] Application implementation and dependency installation approved by the foundation request. Public deployment remains separately gated.
- [ ] Record hosting constraints and local demo fallback; do not deploy in this milestone.

Gate: implementation authorization is explicit; unresolved nonblocking decisions have named owners and defaults.

## M1 — foundation, contracts and persistent schema

Lead: Member 1. Partners: Members 4 and 5. Depends on M0.

- [x] Bootstrap the approved framework and compatible stable dependency versions; commit npm lockfile; document runtime requirements.
- [x] Establish shared layout, theme tokens, accessible components, consistent statuses, timezone/money formatting and error conventions (portal owners).
- [ ] Design Prisma schema and reviewed SQL constraints for slot occupancy, pending offers and active waitlist uniqueness; define patient/slot locking order (database/backend owners).
- [x] Define route/input/output contracts for search, bookings, cancellation, waitlists, matching, approval, offer response, inbox and demo reset. Specify authorization and conflict responses (database/backend owners/5).
- [ ] Establish PostgreSQL development/test setup, migrations, explicit seed command, placeholder environment documentation and independent test database.
- [ ] Implement signed-cookie seeded sessions, clinic memberships, same-origin mutation protection and demo-mode gates (quality/integration coordinator, review Member 1).
- [x] Establish lint, typecheck, unit/integration/browser scripts and build.
- [ ] Configure PR CI and branch protections where permissions permit.
- [x] Check licenses for adopted packages/assets and retain required notices.

Deliverables: bootable app, durable database, shared contracts, migration history, minimal seeded roles, test harness and setup instructions.

Gate: fresh setup/migration works; server authorization is tested; constraints and locking strategy are reviewed; main builds. No feature team invents separate domain states or schemas.

## M2 — one complete persistent vertical slice

Lead: backend owner (Member 5). All members contribute. Depends on M1. Highest implementation priority.

- [ ] Seed Avery's later Harbor booking, Cedar's earlier occupied slot, one eligible request and explicit incompatible candidates (clinic/integration owners).
- [ ] Implement waitlist creation linked to an existing booking without cancelling it (backend owner (Member 5); Patient Portal owner UI).
- [ ] Implement cancellation transaction, released availability and deterministic eligibility suggestions (backend owner (Member 5); Clinic Dashboard owner UI).
- [ ] Implement staff review/approval, exclusive hold and persistent notification, with revalidation (backend/clinic owners).
- [ ] Implement inbox and patient accept/decline endpoints and minimal usable UI (backend/patient owners).
- [ ] Implement atomic cross-clinic replacement, history and release of the original slot; verify clinic-scoped visibility (backend/database/integration owners).
- [ ] Enforce expiry on reads/mutations and expose a stale offer response; support retrying candidate generation (backend owner (Member 5)).
- [ ] Add browser journey and PostgreSQL tests for the entire slice, including rollback and competing acceptance/approval (quality/integration coordinator with backend owner (Member 5)).

Deliverable: PRD workflow B runs through real UI and services without manual database edits.

Gate: AC03–AC08, AC14 and AC15 pass for the slice; refresh and app restart preserve changes; original booking survives every failed replacement. Merge this before adding optional pages.

## M3 — complete the P0 patient and clinic portals

Depends on M1 contracts and M2 services. Leads: Patient Portal and Clinic Dashboard owners; backend support backend owner (Member 5).

### Patient workstream — Patient Portal owner

- [ ] Build search with combined specialty/service, city/area, plan, maximum estimated cost and date availability filters.
- [ ] Build clinic/slot details and booking review with demo insurance/price labels.
- [ ] Integrate direct booking and appointment cancellation with helpful concurrency conflicts.
- [ ] Complete appointment history and waitlists, including unlinked requests, edit and withdraw.
- [ ] Complete inbox with read/unread state, offer expiry, explicit acceptance consequences and result views.
- [ ] Provide responsive navigation, keyboard operation, validation, loading, empty and failure states.

### Clinic workstream — Clinic Dashboard owner

- [ ] Build date-filtered schedule and booking details, future-slot creation/release and cancellation confirmation.
- [ ] Build clinic-scoped waitlist/candidate review with eligibility explanations and staff selection reason.
- [ ] Show approved holds, no-match availability, expired/declined offers and next-candidate review.
- [ ] Add scoped activity history and schedule updates after every committed action.
- [ ] Ensure staff cannot view or modify unrelated clinic records via UI or direct requests.

### Shared services/data — database/backend/integration owners

- [ ] Complete search queries and indexes and all service contracts used by portals.
- [ ] Enforce patient overlap prevention, earlier-only replacement, idempotent requests and invalidation when preferences/bookings change.
- [ ] Expand synthetic seed to PRD minimums and edge cases; use relative dates and example-domain contacts.
- [ ] Add explicit privileged demo reset with confirmation, transactional baseline and demo-mode restriction; startup never resets.

Deliverables: all P0 pages backed by persistence and full synthetic dataset.

Gate: AC01–AC15 have implementation and meaningful verification; no required flow depends on a temporary mock adapter.

## M4 — harden and rehearse

Lead: quality/integration coordinator. Reviewers: all. Depends on M2/M3. Freeze P1/P2 until this gate passes.

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

Lead: integration owner. Depends on M4. Hosting remains unresolved; no deployment is currently authorized.

- [ ] Select hosting only after confirming persistent PostgreSQL, supported runtime, migrations, secrets and budget; retain tested local fallback.
- [ ] Prepare a concrete release/deployment plan with demo-mode controls, reset policy and rollback procedure.
- [ ] Obtain explicit deployment authorization before publishing or modifying hosting.
- [ ] If authorized, deploy the tested build, apply reviewed migrations/seed to the intended demo database and smoke-test role switching and the main journey.
- [ ] Tag a stable revision, stop risky changes before judging, and prepare local run instructions and screenshots as supporting material.

Deliverable: approved, rehearsed demo environment; a local environment is sufficient if deployment is not selected.

## Optional backlog — only after P0 acceptance

- [ ] P1: richer calendar view and days-saved/utilization metrics from persisted events (Clinic Dashboard owner).
- [ ] P1: expanded candidate explanations and clinic filters (clinic/backend owners).
- [ ] P1: richer visibly simulated insurance/payment experience without real credentials (Patient Portal owner).
- [ ] P2: calendar export, maps, realtime push or external notification adapter, chosen only if time and authorization permit.

## PR handoff and definition of done

Every task PR states the behavior, related PRD acceptance IDs, database/API changes, relevant verification results and limitations. Include screenshots for material UI changes and migration notes for schema changes. Require a review partner and successful applicable checks before merge. Coordinate schema/lockfile/shared configuration edits with Member 1. Actual branch protections may depend on repository permissions; do not claim they exist until verified.

Done means persisted behavior works through the interface, server authorization and domain invariants hold, meaningful tests pass, error/empty states exist, synthetic labeling is clear, and documentation reflects the result. Document-only completion for this initial task means the three documents are consistent and ready for user review; it does not imply any application capability is built.

## Foundation review evidence

Branch: `feat/project-foundation`. See `docs/architecture.md` and `docs/api-contracts.md`. Tool scripts are established; integration tests intentionally fail with no suites until the database/backend owners add real PostgreSQL tests. Schema, migrations, seed/reset, sessions, CI/protection and P0 business workflows remain unchecked. The coordinator assigns cross-module review and quality work using the current ownership table.
