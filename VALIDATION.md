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
- `npm run db:migrate`: applied the demo schema; repeated application is idempotent.
- `SEED_CONFIRM=RESET_SYNTHETIC_DATA npm run db:seed`: initialized 4 clinics, 12 patients, 4 staff, 3 specialties, 4 plans plus self-pay and 50 future slots.
- `npm run db:test:prepare`: created/migrated the separate `careousel_test` database; never resets the demo database.
- `npm run lint`: passed, no warnings/errors in final source.
- `npm run typecheck`: passed.
- `npm run format:check`: passed after formatting the split component files.
- `npm test`: **21 passed**.
- `npm run test:integration`: **21 passed**.
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
- Fixtures include incompatible plans/location/budget; overlap, tie and expiry cases are created by isolated tests rather than all being pre-populated in the baseline demo.
- Staff-created slots are 30 minutes with one seeded provider. Rich recurring schedules, analytics, full accessibility audit, multilingual UI and additional browser-engine testing are later work.
- GitHub Actions configuration is supplied; its remote run and repository branch-protection settings must be checked separately. Local passing checks are not a claim that GitHub-hosted CI has already passed.
- Public deployment has not been performed or authorized. Hosting, actual student ownership and the feature-freeze deadline remain team decisions.
