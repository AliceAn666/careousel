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

## Final integration Phase 1 — 2026-10-16 (client timezone)

Base: remote main `bbc753f9387fd1ee6472458524c31f908f3ee244`, new branch `feat/final-integration`, independent worktree. Sole development ownership: user with Codex. PR #5/#6 and merged #7 plus all five requested branches were inspected; optional branches were not integrated. Full inventory and migration/API conflicts: `docs/final-integration.md`.

### Failure evidence and fixes

Actual main GitHub Actions run **38984105042**, job **117251439724**: 4 browser failures/1 pass, while lint/typecheck/unit/integration succeeded; build/persistence skipped. Also inspected PR #7 run 38984058637. Reproduced the **same 4 failures/1 pass** using a detached, pristine main worktree and the isolated PostgreSQL database. My appointments was intentionally disabled until intake, card selectors were obsolete after calendar UX, and decline/expiry fixtures omitted required intake. Tests now cover those intended behaviors without bypassing gates or removing booking/rollback/expiry/security assertions.

Real bugs fixed: homepage entry reset all shared rows through an unauthenticated demo reset service; refresh redirected deep links home; the combined page no longer provided a way to link an existing appointment to a waitlist. Persona switching/home are now nondestructive, reset requires current staff session+same origin+DEMO_MODE+literal RESET through one domain action, refresh retains the route, and the form explicitly selects an owned same-service confirmed booking. The production persistence script also now completes synthetic intake before booking.

### Executed checks

- New PostgreSQL 17 container, port **5542**, database **careousel_test**; existing migrations 0001/0002/0003 applied only there. Fixture seeding/reset occurred only in this isolated container. No schema/migration changes were created, and no shared development/demo database was migrated/reset/reseeded.
- `npm run lint`, `npm run typecheck`: passed.
- `npm test` and equivalent `npm run test`: **30 unit tests passed**. Repeated names in the request refer to the same script, not distinct test suites.
- `npm run test:integration`: **34 real PostgreSQL tests passed**, preserving booking/offer concurrency, rollback, patient/clinic ownership, repeated decline, history, eligibility and intake assertions.
- `npm run test:e2e`: **7 Chromium tests passed**: all 5 adapted original journeys plus independent patient/staff browser-context rescheduling and both reset endpoints' authorization/confirmation/origin checks. Tests assert original→replacement linkage and preserved state after refresh/home/persona entry. Calendar combined filters, plan/date, gray-out, booking and 375px overflow checks remain.
- `npm run build`: passed.
- `npm run test:persistence`: **passed**; confirmed booking and signed patient session survived a production-server restart against the isolated PostgreSQL database.
- Modified-file Prettier checks and `git diff --check`: passed.

Initial local runs also exposed an empty-test-database prerequisite and temporary test-authoring/synchronization errors (duplicate fixture variable; reload before navigation finished); these were corrected before final passing runs. Installed dependencies were copied into an independent dependency directory, with branch-specific Prisma client generation; dependencies/lockfile unchanged. Local Node 24.19.0, PostgreSQL 17 and system Chromium; remote CI used Node 24.21.0. No new external services or credentials are required.

Limitations: Chromium only, no complete accessibility/load/security audit. Registration exists on the inspected optional branch, not main, and is not implemented by this phase. No claim of clinical triage, real insurance checks, live hospital integration, payment processing or production compliance. Existing questionnaire scores remain synthetic administrative hints with FIFO unchanged; clinician-assigned marker and proposal-aligned fairness work remains in the next-stage plan. Remote CI results for this new PR must be distinguished from local results.

## Final integration Phase 2 — proposal and public landing

Started only after PR #8 merged as **main 3e498866aca4159fe687e011b5b73c7e91a5c660** and its [main CI run 39005432827](https://github.com/AliceAn666/careousel/actions/runs/39005432827) completed successfully. Branch: `feat/phase2-proposal-landing`. Selectively adapted PR #5 at b5b4d1a and PR #6 at 1e491c4; no wholesale branch merge or modification of source branches.

PRD.md now takes the October 14 proposal as product source of truth, retains its fingerprint/page references and BP01–13 task/test traceability, updates the actual post-Phase-1 baseline and distinguishes implemented/partial/missing/deferred mechanisms. TASKS.md and AGENTS.md retain sole user + Codex ownership and current-phase boundaries; new clinical/release/AI/payment mechanisms remain plans, not implemented claims.

Public home integrates the patient-first hero, isolated CSS calendar illustration, three-step explanation, clinic introduction, functioning role entrances, demo personas and synthetic-only claims. It remains available with an existing session or state outage. Same-role entry resumes the active patient/clinic identity, including Jordan/Harbor, without reissuing the session. Intake gate, calendar search, combined appointments/waitlists, original-booking selector, clinic priorities/schedule/matching and Phase 1 no-reset behavior remain. There is no registration endpoint on the updated base; the separate registration branch was not added or replaced.

Verification environment: existing installed dependencies copied to an independent directory, Node 24.19.0, system Chromium and a **new isolated PostgreSQL 17 container on port 5543**, database careousel_test. Unchanged existing migrations were applied only there; test fixtures/reset actions affect only that new database. The first migration attempt preceded database readiness and terminated; retry after startup succeeded. No shared demo database was connected/reset/reseeded/migrated.

- Lint and TypeScript: passed.
- Unit: **30 passed**; PostgreSQL integration: **34 passed**, unchanged suites covering scheduling, concurrency, history, decline/expiry, authorization and intake.
- Browser E2E: **10 passed** in the complete final rerun. All seven Phase 1 journeys/assertions are retained, with only public entrance selectors adapted; three additional landing tests cover anchors, both entrances, nondefault identity/cookie continuity, intake gate, clinic scope, keyboard skip/entry, reduced motion, 375/768/1280px overflow and state failure/retry.
- Production build: passed. Production-server restart persistence: passed (confirmed booking and signed session preserved in isolated PostgreSQL).
- Modified-file Prettier, `git diff --check`, and BP01–13 / AT-BP01–13 / T0–T9 coverage consistency: passed.
- Desktop 1440px and mobile 375px captures visually inspected; tablet 768px captured. Screenshot run reported no page script errors.
- Original dirty worktree tracked/untracked source hashes unchanged. Backend/API/auth, schema, all migrations and dependency manifests/lockfile are unchanged from main.

Initial new landing test failures were synchronization/label lookup problems: reloading before home navigation completed, then querying a wrapping label whose text included select options. Tests now wait for the actual home URL; the workspace selector has an explicit accessible name. No application safety assertion was deleted to obtain a pass. Limits: Chromium only, no complete screen-reader/WCAG/load audit, no real clinic/insurer/payment integrations or production healthcare compliance claim. Remote CI for this new PR is distinct from these local results.

## Phase 3 — onboarding and insurance-guided calendar search

Base: main **2e65bffc651c8edc834d68fc86a52ab91b726444**, after PR #8/#9 merged. Verified main [CI run 39006504739](https://github.com/AliceAn666/careousel/actions/runs/39006504739) succeeded before creating `feat/phase3-onboarding-insurance`. Selectively reviewed/adapted guided-insurance-search e6a802e; source branch unchanged. No regression-fix PR was needed because the main gate passed.

Implemented optional patient/clinic walkthroughs adapted to current calendar, fictional benefits, combined appointments/waitlists, notifications and clinic priorities. Intake remains required first; guides never invoke actions/reset and only change screens/browser-local progress. Close/Escape restores focus, unfinished progress resumes by persona, and Finish allows replay. Added a patient getting-started card and compact accessible mobile launch.

Reused the branch's fictional benefit rules and calculator tests. Calendar filters add PPO/HMO, optional simulated in-network/service checks and maximum estimated patient cost, retaining service/location/date/full-listed-price filters. Calendar popovers and details display cent-accurate fictional estimates, unknown/excluded cases and limitations. Browsing never modifies User.plan, session or server booking eligibility. Validated, versioned search preferences are browser-local and keyed by persona; navigation/refresh/home preserves them, identity changes remount the appropriate state, and corrupt/blocked storage falls back safely. Stale-persona detail/intake/waitlist/guide overlays close on persona switching.

### Executed checks

- `npm run lint`, `npm run typecheck`: passed.
- `npm test`: **37 passed** (30 existing plus 4 adapted coverage and 3 preference validation/isolation/storage tests).
- `npm run test:integration`: **34 PostgreSQL tests passed**, retaining scheduling concurrency, expiry/decline, ownership, intake, explicit reset and atomic history/rollback checks.
- `npm run test:e2e`: **13 passed** in the complete rerun (all 10 Phase 1/2 tests unchanged, plus patient guide/progress/bookings, insurance filters/preferences/identity and clinic guide scenarios).
- New browser coverage verifies intake gating, Back/Next/Finish/Escape/focus, resumed/replayed guide, 375px modal bounds, HMO Cardiology exclusion/network/location/cost rules, detail disclaimers, preference isolation across patient switches, unchanged saved plan and original booking, home/refresh continuity and clinic identity.
- `npm run build`: passed. `npm run test:persistence`: passed; the confirmed booking and signed session survived a production-server restart against the isolated PostgreSQL database.
- Modified-file Prettier and `git diff --check`: passed. Backend/API/auth, schema, migrations and dependency manifests/lockfile unchanged.
- Production-mode desktop/mobile screenshots captured and inspected. Mobile horizontal overflow=false and page script errors=[]; guide fits the viewport. Scrollable calendar time lists and a compact mobile guide button preserve navigation space.

Used a **new independent PostgreSQL 17 container on port 5544**, database careousel_test. Only existing unchanged migrations were applied there; all test fixture resets affect only that database. No connection/reset/reseed/migration of shared demo data. Independent copied dependencies and unchanged lockfile; Node 24.19.0 and system Chromium. Original dirty worktree is preserved.

### Compatibility and limitations

Old branch code assumed appointment cards, separate waitlist navigation and ungated tours. Those assumptions were adapted rather than restoring removed UI. Native bounded guide dialogs replace brittle spatial highlights; actual scheduling APIs are untouched. Original tests did not need weaker assertions or selector removals. New storage validation also rejects impossible calendar dates and invalid cost values. No dependency installation, public deployment or automatic merge.

PPO/HMO rules, deductible/copay/coinsurance and referral notes are entirely fictional: no insurer API, actual benefit verification, guaranteed coverage, real payment or clinical eligibility clearance. Patient Careousel booking fee remains zero. Preferences/guide progress do not sync across devices and are not authorization. Real plan enrollment, referral/authorization review, internal-priority network release, multi-need schema, billing/deposits and production identity/compliance remain unfinished/outside this phase. Chromium-only verification is not a complete accessibility/load/security audit. PRD P3-01–04 and README/TASKS/AGENTS document the delivered scope; optional future requirements remain marked as gaps.

## October 17 priority/group/account roadmap review

Documentation-only branch from main 74e6c903f32b227da721d51055f73c4bd7af2aeb after PR #10 merged. GitHub Actions main run 39007746312 completed successfully before branching. Reviewed batch branch 51fcedc and registration branch 37189f7, including their services, schema/migrations and changed-file inventory.

- Updated PRD/TASKS/AGENTS and added docs/priority-account-integration.md with R1–R4 requirements, incremental PR dependencies and planned AT-R* tests. Removed conflicting normative 30-minute/sequential-exclusive defaults; retained descriptions of current legacy behavior as evidence.
- Documentation formatting, diff whitespace, requirement/traceability consistency and documentation-only file boundary checks passed.
- No application tests rerun: no application, fixture, dependency, schema or migration change in this slice. Prior 37 unit / 34 PostgreSQL integration / 13 browser passing results are Phase 3 historical evidence, not tests of the new roadmap mechanisms.
- No database connection, migration, reset/reseed, account provisioning or external invitation delivery performed; shared data and all existing worktrees preserved.
- Four-level priority, manual three-hour group sends, individual account authentication and admin invitations are planned, not implemented by this documentation PR.

## R1 working implementation — four-level request priority

Base: main 842c15665025962a86b53cf150b35fc3f72734d2 after PR #11 merged. Main GitHub Actions run 39008257784 completed successfully before creating feat/request-priority-levels. This is a functional implementation, not a documentation-only update.

Implemented strict setWaitlistPriority, request+clinic P1–P4 decisions, actor/time/reason/version and history, stale/concurrent-edit handling, idempotent repeats, patient display and staff group filter/editor/history. New intake preserves raw self-report without computing urgency; historical symptom records remain. Preference edits append re-review history and invalidate stale approvals. Existing exclusive offer and booking transactions remain unchanged.

Isolation: a new PostgreSQL 17 container careousel-priority-tests bound to 127.0.0.1:5545; careousel_test only, with a distinct unused DATABASE_URL for guard checks. Existing shared demo on port 5432 and all other worktrees/databases were untouched. New migration 0004_waitlist_priority_levels was applied only in isolation; no existing migration bytes changed. An isolated transaction/schema rehearsed upgrade from 0001–0003 with linked bookings and rescheduling history, pending offer, notice, intake, legacy score and both scoped/unscoped requests; all original rows/IDs were preserved and only explicit clinic/linked-booking scopes backfilled as unreviewed.

Actual final checks:

- npm run db:generate and npm run db:test:prepare: passed. Repeat preparation confirmed the checksum-tracked ledger without reseeding. Initial tsx generator attempt hit local IPC EPERM in the restricted shell; rerun with the supported execution network permission succeeded, followed by fresh successful checks.
- npm run lint, npm run typecheck: passed.
- npm test: 39 tests passed. Legacy score-helper tests remain compatibility tests, not evidence of clinical classification.
- npm run test:integration: 38 tests passed after final upgrade-fixture extension; existing scheduling tests unchanged. Includes clinic/patient denial, independent requests/clinics, four exact levels/history, stale and concurrent edits, idempotency, preference invalidation, direct SQL constraints, failed history-write rollback and upgrade data preservation.
- npm run test:e2e: 14 tests passed on final full run, including all 13 prior browser tests unchanged and the new independent-browser staff-review/patient-display/original-protection/mobile workflow.
- npm run build: passed after browser testing.
- npm run test:persistence: passed; confirmed booking, signed patient/staff sessions, request decision and history survived production-server restart.
- Prettier (including npm run format:check) and git diff --check: passed. Production desktop/375px mobile screenshots inspected; no page errors or horizontal overflow. Request-based heading and Pacific-time history labels were verified after the visual review. Original worktree's 21 recorded modified/untracked file hashes preserved.

Earlier test failures were corrected and rerun: five new integration cases attempted candidate-scope assignment before generating the staff preview projection; fixtures now follow the actual preview flow without weakening authorization. First browser run passed the 13 originals but the new case timed out on the select's accessible name; explicit priority/filter labels fixed it and the final 14-test run passed. No acceptance checks were deleted to hide failures; superseded numeric-tag tests were replaced with request-level authorization, history and legacy retention coverage. The existing pg concurrent-query deprecation warning remains non-failing and was not suppressed.

Remaining: current staff identities are pre-authorized synthetic signed demo personas, not the R3 individual-account/R4 administrator invitation system. R2 manually timed competitive group notifications remain unimplemented; saving priority sends nothing. No real employment/insurance verification, clinical triage, external messaging or production compliance claim. Shared migration rollout requires separate review/authorization.

## R3/R4 working implementation — accounts and clinic authority

Feature branch feat/accounts-clinic-access from main 1ac6f91810500fc4f97375db2e569759fe786769 after PR #12 merged. GitHub main run 39009829055 completed successfully before branching. No whole-branch registration/batch merge, no new dependencies, no group-offer constraint relaxation.

Operational changes: individual patient credentials, persistent opaque sessions/login/logout, active name/role, strict patient-only signup, explicit isolated Demo Mode; trusted mock administrator provisioning; in-app manual staff invitation tokens, email/clinic binding, pending approval, revocation, fresh-invitation re-enrollment and last-admin protection. All clinic scheduling/state paths recheck active membership inside the existing advisory-locked transaction. Signed legacy demo sessions remain compatible only for known pre-authorized personas with DEMO_MODE enabled. Account sessions cannot silently enter Demo Mode or reset data.

Isolation: a new PostgreSQL 17 container careousel-accounts-tests on 127.0.0.1:5546, careousel_test. Only new additive 0005_accounts_clinic_access was applied in isolation, alongside untouched 0001–0004 on a clean database. Upgrade rehearsal also applies 0005 to a transactional legacy schema, checks original booking/history/waitlist/offer/notification/intake/tag rows remain identical and creates zero automatic accounts/memberships. Shared demo port 5432 was never accessed/migrated/reset/reseeded; no shared administrator provisioning. The original worktree's 21 recorded modified/untracked file hashes remain unchanged.

Actual final results:

- npm run db:generate / db:test:prepare: passed, engine-free pinned Prisma client and isolated additive SQL.
- npm run lint / typecheck: passed.
- npm test: 41 passed, including password hashing/salt/verification and strict patient-only/synthetic contact validation.
- npm run test:integration: 45 passed. Includes persisted login throttling, invitation/replay/email/expiry/revocation, pending and revoked staff rejection, foreign-clinic/last-admin denial, transaction-time access checks, data-preserving re-enrollment without reviving old sessions, and individual-account booking→waitlist→P2 review→offer→atomic replacement preserving Avery's original booking. Existing scheduling safety and upgrade tests remain.
- npm run test:e2e: final full run 17 passed. Original 14 journeys explicitly opt into Demo Mode (only setup/entrance adaptation, safety assertions retained). New normal-account flows cover registration, intake, home/refresh, no persona selector, preserved cancellation/data, logout and stale cookie, admin invite→staff registration→approval→login→revocation, role-injection/CSRF denial and actual session expiry.
- npm run build: final production build passed after final browser regression.
- npm run test:persistence: passed after final build; confirmed booking, signed demo sessions, individual account session and request priority/history survived a production restart against isolated PostgreSQL.
- npm run format:check / docs formatting / git diff --check: passed. Production desktop and 375px mobile login/admin screens inspected: no page errors or horizontal overflow. No credentials/invitation secrets captured in screenshots.

Corrected failures, not suppressed: an original repeated-rescheduling test inherited wall-clock time and generated a midnight-crossing slot near Pacific midnight, conflicting with existing same-day eligibility; fixed the fixture to 17:00 UTC without changing its history assertions or matching rules. React effect lint required asynchronous dashboard-state callbacks with cleanup. The first browser pass found a real outage-entrance regression (buttons enabled during state error), now disabled with retry retained, and a new test reloaded before home navigation committed, now awaiting the route. A final full 17-test rerun passed after recovery logic was added; all 45 integration tests were rerun as well. Existing pg concurrent-query deprecation warnings remain non-failing and unsuppressed.

Simulation/limits: fictional example/test addresses and synthetic clinics only; institution/email verification and invitation delivery are mock/manual, not real hospital validation or outbound email. One role and one clinic per staff account in this slice. No MFA/password recovery/admin transfer UI, production identity/compliance certification, real insurance/payment integration or clinical AI judgment. Staff invitations are operational; appointment priority-group invitations with a manual three-hour interval remain R2 work, not delivered here. Normal sessions never reset; the separately confirmed Demo Mode reset visibly warns that it clears synthetic registered accounts/sessions too. Shared migration/bootstrap requires separate explicit authorization.

## Phase 7 — automated priority-group notifications

Base: PR #13 merged main **0de5aaaf175b10fe86bed5cb7c8cbaa44e598192**. Verified [main Actions run 39013494376](https://github.com/AliceAn666/careousel/actions/runs/39013494376) completed successfully before creating `feat/automated-priority-notifications`. This is a functional implementation, with no wholesale old-branch merge. Selectively inspected batch branch 51fcedc service/worker/SQL; rejected its two groups, 1–60 minute timing, pending-response gate and HELD semantics rather than copying them.

Delivered: shared cross-clinic pool, exact human-approved request/clinic P1–P4, preview/exclusions and selected recipient snapshots, one-time complete-sequence authorization, immediate first eligible group and durable independent automatic worker. Actual send times, fixed 180-minute minimum, no catch-up burst, skipped groups without fake timestamps, membership/eligibility/version rechecks, pause/resume/cancel and explicit fresh reauthorization of unsent groups are working paths. Successful committed acceptance atomically completes the sequence, cancels future jobs/groups, revokes competitors with real inbox explanations and preserves losing/original/unrelated appointments. Direct booking and legacy offers cannot bypass active group workflows. Synthetic referral/authorization flags fail closed until staff review. All external delivery remains absent: these are actual database-backed in-app notifications, not email/SMS.

Isolation: new PostgreSQL 17 container **careousel-phase7-tests**, 127.0.0.1:5547, **careousel_test** only. Separate unused DATABASE_URL used for test guard checks. New additive **0006_automated_notifications** and **0007_notification_sequence_history** were applied only there. Existing 0001–0005 bytes are unchanged; no shared database was accessed/migrated/reset/reseeded. 0006 preserves legacy offers and notifications; 0007 retains historical sequences for repeated openings. Schema/type generation uses existing pinned Prisma; dependencies and lockfile unchanged.

Actual final results:

- `npm run db:generate` / `db:test:prepare`: passed, including checksum-ledger replay and upgrade rehearsal preserving legacy pending exclusive offers/notices.
- `npm run lint` / `typecheck`: passed.
- `npm test`: **43 passed** (41 baseline + 2 interval/input/requirement checks).
- `npm run test:integration`: **63 passed**, final full rerun. Includes all 45 baseline tests plus group timing at 179:59.999/180:00, overdue actual-send scheduling, concurrent workers, same/across-group concurrent acceptances, acceptance-vs-worker race, complete rollback, injected notification-write failure/retry, preserved originals, direct-booking/legacy bypass denial, stale preview/decision pause and explicit reauthorization, missing priority, no silent new recipients, revoked staff, referral/authorization checks, pause/resume/cancel, decline, expiration/start-time stop, sequence history/interval retention, database-client restart and raw SQL forged-group/mixed-mode rejection.
- `npm run test:e2e`: **18 passed** in the complete Chromium run, retaining all 17 baseline account/admin/intake/insurance/calendar/history/legacy workflow cases. Added actual staff preview/selection/authorization → P1 → controlled isolated worker P2 → patient acceptance → automatic termination, original preservation, CSRF and 375px bounds. Focused Phase 7 rerun passed after visual review removed irrelevant controls on a filled opening; mobile screenshot inspected.
- `npm run build`: production build passed.
- `npm run test:persistence`: **passed**. Existing booking, account/demo sessions and priority/history survive production restart. Then the guarded isolated fixture records controlled past P1, stops the web server, starts a **fresh independent worker process**, sends overdue P2 with no web server/browser running, and verifies history/next schedule after production restart. Real interval stays 180 minutes; no public time-control API exists.
- `npm run format:check`, documentation Prettier and `git diff --check`: passed. No dependency/lockfile change, public deployment or automatic merge.

Corrected test/development issues were not hidden: an unreviewed fixture initially violated existing assignedBy/assignedAt consistency and was corrected; the persistence parent process initially lacked explicit Demo Mode and was correctly denied, then configured only in its already-isolated test scope. An attempted 0006 adjustment was stopped by automatic review; read-only checksum comparison proved its exact original bytes, those bytes were restored to ledger hash 2b147c8d5c7fb093de015c2161ba505960302fa01ff2fdc57e1c2566d51cd2db, and the history change was added separately as 0007. No applied checksum was replaced or shared data changed. Existing pg concurrent-query deprecation warnings remain non-failing and unsuppressed.

Limits/next steps: run the independent worker under a process supervisor or cron after separately authorized migration/rollout; app startup alone does not supervise it and worker outages delay sends until recovery. Global scheduling lock suits this small synthetic prototype, not a load-tested high-volume system. Chromium-only checks are not a complete accessibility/security audit. External email/SMS/push, real institution/insurance/referral verification, advanced service-variant/independent-care-need models and production compliance remain outside this phase. Impact dashboard not started. User review/merge and public/shared rollout remain separate; local results do not claim remote PR CI success.

## Patient search-first UX redesign

Base: main fabe782991a6c04c7678f2612ab46e87f7655444 (PR #14 merged), verified successful [main Actions run 39015399589](https://github.com/AliceAn666/careousel/actions/runs/39015399589) before creating feat/patient-search-first.

Operational changes: removed the patient symptom-questionnaire component, summary and UI/scheduling completion gates. Retained existing Intake/SymptomTag storage and historical API compatibility; no normal UI reintroduces intake. Search now uses service/specialty text, four categories, existing combined filters and earliest-first labeled result cards. Fictional PPO/HMO comparisons remain optional/expandable, details and direct booking work, and an empty category can register a prefilled waitlist. Vaccinations/Blood Tests extend service strings without changing seeded appointments. Navigation exposes booking, earlier requests with immediate create action, and combined management; inbox/optional Quick tour remain, duplicate onboarding panel is removed. Clinic schedule and group/account safety services remain intact.

Isolation: new PostgreSQL 17 container careousel-search-tests, 127.0.0.1:5548, careousel_test, separate unused initial DATABASE_URL. Existing checksum-tracked migrations were applied only to that isolated database. No schema, migration or seed source changes; no shared database access/migration/reset/reseed, account provisioning, public deployment or automatic merge. The original worktree's 21 recorded modified/untracked file hashes remain unchanged.

Actual verification:

- npm ci --ignore-scripts and db:generate/db:test:prepare passed (the managed environment required a writable /tmp npm cache). Package manifest and lockfile unchanged.
- npm run lint / npm run typecheck / npm run format:check and documentation formatting / git diff --check passed.
- npm test: 43 passed.
- npm run test:integration: 63 passed. Existing scheduling/concurrency/SQL/account/P1–P4/automatic-sequence regressions retained; the legacy intake test now proves booking without intake and retained raw answers. Scheduling fixtures no longer submit intake, proving the full offer/atomic replacement flow does not require it.
- npm run test:e2e: final full Chromium run 19 passed (1.9m). All 18 prior journeys remain with intentional questionnaire/calendar/navigation expectation adaptations. New search-first case covers zero-intake access, chronological results, free-text/category filtering, empty-category waitlist prefill/persistence, three activity routes, earlier-request original selection, single active navigation item, identity/original booking preservation and 375px bounds. Existing insurance, account/admin revocation, independent-browser replacement, automatic P1→P2 worker, decline/expiry and CSRF checks remain.
- npm run build: final production build passed after the final browser run.
- npm run test:persistence: final run passed. Booking, individual/demo sessions, request priorities/history and authorized sequences survive production restart; a fresh independent worker sends overdue P2 with no web server/browser running. Real 180-minute rules unchanged.
- Final desktop/375px screenshots inspected. Removed duplicate guide panel after visual review so the service search field is visible on the mobile first screen. No horizontal overflow. Screenshots contain only synthetic identities, no credentials.

Corrected test failures were not hidden: early browser runs still expected Quick tour to be questionnaire-disabled; those obsolete gates now assert immediate availability. The new waitlist test initially used ambiguous wrapping-label lookup, corrected with explicit accessible select labeling/combobox role, and its later navigation heading assertion needed the existing rendered terminal period. A final full rerun passed after navigation/mobile/guide refinements; no scheduling safety assertion was removed. Existing pg concurrent-query deprecation warnings remain non-failing and unsuppressed.

Limits: no new clinical triage, clinician-authored tag editor or medical-record import integration; these are separate future work. Insurance/costs and clinic identities remain synthetic, not verified coverage. Some service categories have no current synthetic opening and show a real empty state with working waitlist registration. External delivery remains absent; existing automatic notifications are durable in-app records. Shared data remains untouched; this UX change requires no new database migration.

## Patient UX correction — optional symptoms and task-first entry

Branch `feat/patient-entry-without-symptom-gate` starts from merged PR #14 main fabe782. This changes actual UI and server behavior: new/returning patients can search, book eligible services, register a linked/unlinked waitlist request and accept a valid invitation without completing generic intake. Patient entry offers Book an Appointment, Find an Earlier Appointment and Manage My Medical Needs. Existing booking cards can prefill a protected earlier-request form; existing appointment/inbox routes remain compatible. Vaccination, Blood test and Routine examination are added service choices; no shared opening/fixture is created automatically.

Symptoms are optional under a separate health-information route, with saved self-report retained rather than overwritten. Returning patients can also submit an optional first self-report. P1–P4 remains human-approved per request/clinic; no symptom scoring, diagnosis, urgency inference or automatic triage was added. Emergency guidance remains informational. Phase 8 clinician-authored tags and patient-authorized medical imports are clearly labeled future/unconnected sections; no upload/import or real record access is implemented. Updated guides and navigation work without intake. External appointments may be represented by an unlinked need; they are not imported/cancelled, and the existing one-active-request-per-service model remains.

Isolation: new PostgreSQL 17 container **careousel-patient-ux-tests**, 127.0.0.1:5548, **careousel_test**. Existing unchanged migrations were applied only there. No shared database connection/reset/reseed/migration, schema change, dependency or lockfile change. Previous Phase 7 test database on port 5547 was not used by these suites.

Actual checks:

- lint and strict TypeScript: passed.
- Unit: **43 passed**.
- PostgreSQL integration: **70 passed** (63 baseline plus 7 new no-intake/basic booking, linked replacement, full saved-intake preservation and service-clearance/role/overlap cases). Superseded first-visit gate assertions were replaced with the explicitly requested no-gate policy; priority provenance, authorization, concurrency, expiry and original-booking safety assertions were retained.
- Chromium E2E: **20 passed**, including all baseline flows adapted only for the new patient entry/policy. New cases exercise direct linked waitlist registration with no symptoms, prefilled existing-booking shortcut, actual vaccination booking without intake, optional submission and saved information after refresh, future Phase 8 labels and 375px bounds. Mobile entry screenshot inspected; no horizontal overflow.
- Production build: passed.
- Production restart persistence: passed; existing booking, account/demo sessions, request priority/history and the independent notification-worker recovery continue to survive restart in the isolated database.
- Prettier/source/docs formatting and git diff whitespace checks: passed.

One new negative-test fixture initially retried the patient's already-confirmed original slot and correctly received idempotent success; it was corrected to create a distinct overlapping available slot, preserving the intended overlap-denial assertion. No protection was weakened to obtain passing tests. The initial Link lint finding was fixed using Next.js Link. Existing pg deprecation warnings remain non-failing and unsuppressed.

No database migration is needed for this PR. Saved intake and patient data remain unchanged. No shared demo process was updated, no public deployment or automatic merge performed. Real clinician tags, verified records/consent/import workflows, additional clinical requirements and production medical/security validation remain future work, not claims of this UI preparation.

The above PR #15 record is historical. PR #16 supersedes its optional-questionnaire UI, retains service identifiers and linked-booking shortcuts, and keeps the health-information route read-only.

### Final latest-main reconciliation for PR #16

During delivery, PR #15 merged into main f5212eb4f0f33ebc68f8cc78b234a984f7a35963. Verified [main Actions 39019173922](https://github.com/AliceAn666/careousel/actions/runs/39019173922) succeeded, then merged that main into this feature branch without rewriting history. Preserved its canonical Vaccination/Blood test/Routine examination identifiers, task-hub/earlier/needs/history route compatibility, protected existing-booking request shortcut and all seven added PostgreSQL cases. Per the latest explicit request, removed its optional questionnaire rather than relocating it; the health-information route is read-only historical/future-work information. Normal entry opens search directly. No backend scheduling, schema, migration or seed-source difference remains against this latest main.

Final reconciled results: lint, typecheck, formatting/diff checks passed; **43 unit**, **70 PostgreSQL integration**, and **21 full Chromium E2E** passed. Both main's task-entry cases remain, adapted for cards and read-only history; the new search-first case remains. Final production build and production/independent-worker restart persistence passed. Test target remains this branch's isolated careousel-search-tests on port 5548 only; shared data untouched. No applied migration changes, force push, automatic merge or deployment.

Additional verification corrections: an intermediate local Vitest invocation discovered recovery snapshots under work/ as duplicate test files; renamed those scratch snapshots, with no test exclusions/config changes, then reran all 70 real integration cases successfully. The health-history browser case now explicitly waits for its route before refreshing. An older account case queried the saved cookie immediately after clicking logout, before the DELETE transaction completed; it now awaits the successful DELETE response and home navigation, then retains the exact stale-token denial assertion. The final full 21-case run passed with these stronger completion checks. No safety assertion was removed.


## Phase 8 Part A — actual isolated verification (October 17, 2026)

Base: CI-verified main `3f36058`, after merged PR16/PR17. Branch: `feat/phase8-clinician-medical-tags`. This section supersedes earlier future/unconnected tag placeholders; it does not change historical validation results. Record import and complete independent per-need scheduling remain PR2/PR3.

- Lint and typecheck passed. Lint retains one inherited anonymous-export warning in the Cloudflare worker; no deployment configuration was changed.
- Production webpack build passed.
- Unit tests: **51 passed**, 10 files.
- PostgreSQL integration tests: **78 passed**, 9 files. New coverage includes clinical grants/revocation, patient/clinic privacy, started-visit eligibility, concurrent reviews, immutable snapshots/provenance, atomic rollback and additive preservation of populated historical records.
- Chromium E2E: **23 passed**. New journeys use functional clinic create/approve/edit, patient approved-only visibility, mobile bounds, explicit administrator grants/revocation, anonymous/patient write denial and same-origin protections. Existing search, insurance, guides, booking races, original preservation and automated sequences remain covered.
- Production persistence rehearsal passed for medical tags, clinical needs, version history, account/demo sessions, bookings, approved priorities/history and independent worker recovery with the web server stopped.
- Format and diff checks passed. The internal notification route has formatting-only cleanup for an inherited Prettier failure.

All database checks used a newly created isolated PostgreSQL 17 container on local port 5549 with `careousel_test`. No existing Codespaces, cloud or shared demo database was accessed, migrated, reset or reseeded. No deployment or automatic merge. See [medical-tag contracts and limitations](docs/medical-tags.md).
