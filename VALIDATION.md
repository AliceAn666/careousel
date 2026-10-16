# Careousel initial prototype validation

Validated locally on 2026-10-16 using Node 24.19.0, npm 11.9.0, PostgreSQL 17 in Docker, Next.js 16.4.2 and headless Chromium. Built from main `0a620b06b3082bf0710f2ddb420fc84aa052ce4a` on `feat/careousel-prototype`; deleted frontend files are not restored.

## Milestone results

| Milestone              | Delivered                                                                                                                                                        | Verification                                                                                                                             | Remaining                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Foundation             | Clean TypeScript app, original responsive UI, PostgreSQL volume, reviewed SQL migrations, pinned Prisma driver adapter, signed demo sessions                     | Fresh `npm ci --ignore-scripts`, engine-free client generation, demo migration/seed and test database preparation succeeded              | Human schema review and repository branch protection                    |
| Scheduling workflow    | Booking, linked/unlinked waitlists, automatic persisted suggestions, staff approval, exclusive offers, inbox, decline/expiry and atomic cross-clinic replacement | 21 unit tests and 21 real PostgreSQL integration tests passed                                                                            | Broader load testing and advanced clinical eligibility are out of scope |
| Patient/clinic portals | Combined search, booking review, waitlist preferences, notification responses, schedules, new openings, staff matching explanations, activity and demo reset     | 5 Chromium browser tests passed; patient/staff desktop and 375px mobile screenshots visually reviewed; visual session had no page errors | Full keyboard/screen-reader audit and additional browser engines        |
| Persistence/rehearsal  | Explicit seed/reset, shared database state and setup/demo guide                                                                                                  | Production server booked through API, restarted, and retained both booking and session                                                   | Two rehearsals by the student presenters on the judging machine         |

## Executed checks

- `npm ci --ignore-scripts`: passed from the committed lockfile configuration.
- `npm run db:generate`: passed with the pinned engine-free generator integration.
- `npm run db:migrate`: applied the demo schema; the PR #3 follow-up migration was applied additively after a zero-mismatch preflight. No demo rows were reset or deleted.
- `SEED_CONFIRM=RESET_SYNTHETIC_DATA npm run db:seed`: the initial run initialized 4 clinics, 12 patients, 4 staff and 50 future slots. The current seed definition has 56 slots and additional synthetic scenarios; it was validated in the isolated integration database and was not run against the current demo database.
- `npm run db:test:prepare`: created/migrated the separate `careousel_test` database and applied migration `0002`; it never resets the demo database.
- `npm run lint`: passed, no warnings/errors in final source.
- `npm run typecheck`: passed.
- `npm run format:check`: passed after formatting the split component files.
- `npm test`: **26 passed**.
- `npm run test:integration`: **27 passed**.
- `npm run test:e2e`: **5 passed**.
- `npm run build`: passed after the final scheduling guards and component split.
- `npm run test:persistence`: passed; uses a production server and isolated PostgreSQL test database.

The final integration pass adds guards/tests for a stale withdrawal after fulfillment, foreign notification reads, stable ordering of equal-time requests, and competing approvals for different patients. These guards do not expose test-only routes. The rollback fault injection exists only in the directly imported domain-service test API.

## What the tests establish

Unit tests cover hard eligibility exclusions, no overlap versus adjacency, earlier-only replacement, Pacific DST date conversion, fallback without credentials, provider failure, advisory provider output without names, and signed-session tampering/expiry.

PostgreSQL tests cover the full replacement and notification/audit changes, competing direct bookings, duplicate acceptance, rollback after partial writes, decline, expiry, clinic/patient isolation, same- and different-candidate approval races, patient overlap across slots, withdrawal and preference invalidation, original-booking cancellation, duplicate waitlists, foreign booking links, database-level slot uniqueness, scoped snapshots, demo-reset gates and stable FIFO ties.

Browser tests cover:

1. Patient joins while keeping original booking → staff cancellation → match explanation fallback → staff approval → notification acceptance → new confirmed/old rescheduled state after refresh.
2. Specialty/location/cost filtering, insurance/date filtering, clear filters, booking review/confirmation and no page overflow at 375px.
3. Missing-session and foreign-origin mutation rejection.
4. Patient declines through the inbox and retains the original appointment.
5. Expired invitation is inactive in the inbox and preserves the original appointment. Expiry is advanced in the isolated fixture database rather than waiting ten minutes.

## PRD acceptance evidence and limits

| Acceptance | Evidence                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------- |
| AC01       | Browser combined-filter and insurance/date checks; filters operate on current server snapshot     |
| AC02       | Concurrent booking integration test and partial unique slot index                                 |
| AC03       | Main browser flow and persistent linked waitlist integration test                                 |
| AC04       | Cancellation generates suggestions; incompatible candidates excluded; FIFO and tie tests          |
| AC05       | Approval produces a hold/notification before any replacement booking                              |
| AC06       | Transactional replacement integration test and complete browser flow                              |
| AC07       | Decline/expiry integration + browser tests; injected failure rollback                             |
| AC08       | Repeated accept/approval, conflicting approval and stale-offer tests                              |
| AC09       | Cross-clinic/patient/notification service checks, scoped snapshots and HTTP session/origin checks |
| AC10       | Real production-server restart persistence check                                                  |
| AC11       | Role/demo-mode gates, repeated fixture reset; no startup seeding                                  |
| AC12       | Browser main flow and mobile overflow check; comprehensive keyboard audit remains pending         |
| AC13       | Same-patient overlapping-slot race; unit adjacency boundary                                       |
| AC14       | Preference edit, withdrawal and linked-booking cancellation revoke pending offers                 |
| AC15       | Fault-injected replacement rolls back old/new bookings and offer state                            |

These checks provide prototype evidence, not production healthcare/security certification or a claim that every release-gate item in TASKS.md is complete.

## Deliberate limitations and next review work

- No actual external AI provider was called. Credential-free fallback and mocked provider success/failure are tested. Provider availability is optional; staff remain responsible for scheduling decisions and clinical urgency.
- Original responsive CSS replaces the proposed Tailwind/shadcn setup for this milestone. Clinic details and booking review are dialogs rather than standalone pages.
- One advisory lock serializes the small demo workload. There is no throughput/load claim; scaling requires reviewed finer-grained locking and query pagination.
- The UI polls every 12 seconds and refreshes immediately after mutations. No SMS/email or push service is connected.
- Production authentication, real insurance verification, billing, medical records, travel buffers, specialized clinical constraints and real clinic integrations are absent by design.
- The explicit synthetic seed includes pending/expired offers, overlap, tied priorities, service/time incompatibilities and a no-match cancellation scenario. These updated fixtures were verified in `careousel_test`; the existing demo data was not reseeded.
- Staff-created slots are 30 minutes with one seeded provider. Rich recurring schedules, analytics, full accessibility audit, multilingual UI and additional browser-engine testing are later work.
- GitHub Actions configuration is supplied; its remote run and repository branch-protection settings must be checked separately. Local passing checks are not a claim that GitHub-hosted CI has already passed.
- Public deployment has not been performed or authorized. Hosting, actual student ownership and the feature-freeze deadline remain team decisions.

## PR #3 review follow-up — 2026-10-16

Work is based on `e063f386e618a43b9606ffa70f4567a4d54c720e`. The uncommitted Codespaces origin fix was preserved.

- P0 stale-time guard: `performAction()` samples its injected/server clock only after acquiring the advisory lock. A controlled-clock PostgreSQL test holds the lock until an offer expires and confirms acceptance is rejected.
- P0 cancellation durability: cancellation and slot release commit before matching refresh runs in a separate locked transaction. Fault injection confirms cancellation survives refresh failure; a later `getState()` refresh recreates suggestions idempotently. Replacement acceptance still refreshes within its atomic transaction.
- P1 replacement history: an additive self-relation links each rescheduled booking to its successor. Repeated rescheduling verifies the persisted chain; a new database check prevents self-links and invalid linked status.
- P1 retry behavior and seed: repeated decline is idempotent while accepting a declined offer still conflicts. Integration validation covers seeded offer states, overlaps, tied priorities, service/time exclusions and no-match cancellation.
- Database integrity: additive composite foreign keys bind waitlists and offers to the same patient as their linked records. Direct SQL tests verify cross-patient links fail and one-confirmed-booking/one-pending-hold per slot constraints remain enforced.
- Migration `0002_booking_history_patient_integrity` was applied to both isolated `careousel_test` and the current `careousel` database. Before applying it to `careousel`, read-only preflight found zero cross-patient mismatches; the migration added schema only, without resetting or deleting demo rows.
- Follow-up checks: `npm run db:generate`, `npm exec -- prisma validate`, 26 unit tests, 27 PostgreSQL integration tests, lint, typecheck, format check and production build passed. The browser E2E suite was not rerun for this server/domain-only follow-up; its previously recorded 5-test result is from the initial prototype validation.
