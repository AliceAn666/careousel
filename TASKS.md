# Careousel proposal-aligned development roadmap

## Unified patient management — October 17, 2026

The latest user-approved navigation supersedes the earlier three-page presentation: Book an Appointment and My Appointments & Waitlists are the two primary patient activities. Health Information and Notifications remain separate accessible destinations. Earlier appointment requests are contextual actions on confirmed appointment cards and beside Join a waitlist; multiple confirmed appointments require choosing the original. Need-linked bookings retain their need-specific workflow rather than creating unbound legacy requests. No confirmed appointment means no earlier-replacement action. Existing /waitlists, /earlier and /needs links remain compatible aliases of the management view, with its navigation item active. Remove the duplicate keep-original and historical-health cards; preserve original-booking warnings in the actual request dialog, historical records on Health Information, independent needs, external appointment disclosures and all scheduling protections. No schema, migration or shared demo database changes.

Acceptance: contextual requests prefill the correct booking; multiple originals can be selected; empty accounts can book or join without misleading replacement prompts; linked needs remain isolated; sidebar, old links, refresh and mobile retain identity and original bookings. Existing clinic, authorization, group timing and atomic replacement regressions must continue passing. Implementation and regression results are recorded in VALIDATION.md.

## Patient search-first redesign — October 17, 2026

This user-approved UX requirement supersedes all earlier instructions to require first-visit symptom intake or use a monthly clinic-icon calendar for patient search. No symptom questionnaire is shown in normal patient UI, including optional onboarding. No intake-completion gate applies to search, direct booking, waitlist registration, acceptance or guides. Existing Intake/SymptomTag rows and historical API compatibility are retained without deletion, migration or automatic backfill. Clinician-authored tags are implemented in Phase 8 Part A; patient-authorized synthetic record import and clinician-reviewed extraction are implemented in Part B. Do not invent clinical information.

Patient navigation centers on Book an Appointment, Find an Earlier Appointment, and Manage My Appointments and Waitlists, plus the durable notification inbox. Search includes a service/specialty text field, categories (Vaccinations, Blood Tests, Routine Checkups mapped to Primary care / Routine examination, Specialist Visits), service/location/insurance/date/listed-cost and fictional estimated-patient-cost filters. Only matching labeled appointment cards appear, earliest first; details/booking and waitlist actions remain available. Vaccination, Blood test and Routine examination are supported request service strings, but current synthetic fixtures may have no matching openings; display an honest empty state. Never relabel a specialist appointment as another service. Clinic operational schedules are preserved.

Service-specific referral/authorization, saved-plan eligibility, availability, request/clinic human-approved P1–P4, account/clinic scope, atomic replacement, occupancy constraints and authorized automatic 180-minute group sequences remain enforced. No shared database reset/reseed, automatic migration, clinical inference or real insurance-verification claim.

Acceptance: new patients can browse/book/join/accept without Intake rows; historical intake survives normal operations; search results combine filters, show readable clinic/service/location/time/price, exclude nonmatches and sort chronologically; empty categories allow waitlist registration; navigation/home/refresh preserve account and bookings; existing clinic/group/concurrency/expiry/rollback regressions continue passing in isolation.

## Phase 7 — current authoritative notification policy

This section supersedes ALL older internal-clinic-first/release-stage plans and requirements for a separate manual send per group below. Historical proposal comparisons and validation records are retained as history, not active acceptance criteria. Base: PR #13 merged main `0de5aaaf175b10fe86bed5cb7c8cbaa44e598192`; [main CI 39013494376](https://github.com/AliceAn666/careousel/actions/runs/39013494376) succeeded before the feature branch.

- One shared cross-clinic eligible candidate pool, with no internal-clinic-first preference, window or extra network release stage.
- Exact P1 Time-Sensitive, P2 High Priority, P3 Routine, P4 Flexible, human-approved for each request at the offering clinic. No missing-level default, patient-assigned level or AI clinical inference.
- Staff preview eligibility/exclusions, explicitly select recipients and the first group, and authorize the complete sequence once. The first eligible selected group sends immediately. Only the saved recipient snapshot can be sent automatically later; newly arriving/changed patients need explicit review.
- Next actual group send is at least **180 minutes after the previous server-recorded actual send**, even after restart, delay, cancellation/restart or pause/resume. Empty/invalid groups are skipped without send timestamps or interval reset. Delayed processing sends one group, then schedules from that actual send; it never catches up in bursts.
- Durable PostgreSQL sequences/groups, independent supervised worker (`npm run worker:notifications`), transaction-scoped advisory lock and idempotent persisted group status. No browser or read request drives automatic sends. Worker outage delays delivery; restart safely recovers overdue work. Do not confuse durable scheduling with a guarantee of exact wall-clock delivery.
- All sent groups compete for one slot. Group invitations expire after 12 hours or appointment start, whichever is earlier; prior unexpired invitations remain valid when the next group sends. Legacy exclusive invitations retain their ten-minute hold and cannot mix with group invitations.
- Successful committed acceptance atomically books, safely replaces only a linked original appointment, fulfills that request, terminates the sequence, cancels future groups, revokes competing invitations and persists audit/notifications. Failed acceptance rolls back and leaves scheduling/original bookings intact. Direct booking cannot bypass active/paused/scheduled groups or pending competitive invitations.
- Changed request/priority snapshot pauses the sequence for explicit reauthorization of remaining groups. Inactive/withdrawn/ineligible recipients are skipped, never replaced automatically. Revoked author authority pauses; revoked priority-assigner authority excludes affected recipients. Staff receive durable in-app warnings and audit entries. Pause stops future sends but does not revoke invitations already sent; Cancel does revoke them. Resume reuses the same approved snapshot; fresh preview + authorization can replace only unsent groups, preserving prior send times/history.
- Slot referral/authorization requirements fail closed until staff explicitly approve synthetic request/clinic clearance; accept rechecks it. Existing low-complexity slots default to not requiring these flags. No claim of actual insurer/referral verification or clinical screening.

Implemented code and operational details: [Phase 7 guide](docs/automated-notifications.md). Shared migration rollout remains separately authorized; no shared data migration/reset/reseed, automatic merge, impact dashboard or deployment in this phase.

Ownership: **the user working independently with Codex**. No five-person assignments, teammate requests or agent delegation. October 14, 2026 business proposal is the product source of truth; see PRD.md for source fingerprint, current-state gaps and BP01–BP13 → tasks → AT-BP01–AT-BP13 traceability. A planned task is not an implemented feature.

## Historical Phase 1–3 integration boundary

- Phase 1: PR #8 merged into main `3e49886`; main CI run 39005432827 passed before Phase 2 began. Preserve intake gate, calendar search, combined appointments/waitlists, explicit original-booking selection, atomic replacement, no-reset navigation/session behavior and isolated-test protections.
- Phase 2 (`feat/phase2-proposal-landing`): selectively integrate PR #5 requirements and PR #6 public landing presentation. Adapt role entrances and tests to the current app, never replace current app/service snapshots wholesale. No schema or migration changes, registration implementation, batch notifications, tours, deployment or automatic merge.
- Registration and bilingual/batch branches remain future work; guided-insurance functionality is selectively adapted in Phase 3, not merged wholesale. Current main has no registration endpoint. Inventory and migration risks remain in docs/final-integration.md.
- Uncommitted original-worktree SQL-clock/history/integrity patches are reference work only; preserve their files. Their reversed history relation and alternative migration names must not be applied over main blindly.

## Phase 2 completion gate — merged in PR #9

- [x] Verify PR #8 merged and exact latest-main CI successful before branching.
- [x] Adapt PRD/AGENTS/TASKS to proposal requirements, current baseline and sole ownership.
- [x] Integrate independent landing component/styles, patient-first hero, working anchors, patient and clinic entrances, synthetic labels and existing-session continuity.
- [x] Retain Phase 1 tests; change only public entrance selectors where necessary. Extend landing tests for new and returning personas, intake gate, clinic scope, browser refresh, keyboard/mobile/reduced-motion and state outage/retry.
- [x] Run lint/typecheck/unit/PostgreSQL integration/browser/build and production restart persistence; actual results are recorded in VALIDATION.md.
- [x] User review and merge of Phase 2 PR #9; do not merge automatically. No change to shared demo data or migration files.

## Phase 3 — onboarding and insurance, merged in PR #10

Sole owner: user + Codex. Base main 2e65bff, CI 39006504739 passed before work; adapt e6a802e selectively. Scope is P3-01–04 in PRD, supporting BP02/07/11/13 and existing T5/T6 work, not completion of every proposal requirement.

- [x] Preserve first-visit intake, public home, calendar/combined page and clinic priority workflow; adapt guide routes and copy rather than old card/navigation code.
- [x] Add optional, resumable read-only patient and clinic guides with keyboard/focus/mobile support; no automatic popup, booking or reset.
- [x] Add fictional PPO/HMO calculator, network/service and patient-cost filters to calendar/popups/details; keep listed price and browsing comparison distinct from saved patient booking plan.
- [x] Scope browser-local preferences/progress to persona; validate storage and handle unavailable storage. Clear transient old-persona overlays during switching.
- [x] Run lint/typecheck/unit/PostgreSQL integration/browser/build and record actual results in VALIDATION.md; all passed, including 37 unit, 34 integration and 13 browser tests; preserve all Phase 1/2 assertions.
- [x] User reviewed and merged Phase 3 PR #10; no automatic merge/deploy. No shared database changes or schema/migration work.

## Historical October 17 roadmap (superseded by Phase 7 above)

- [x] Inspect main 74e6c90 after PR #10 and require successful main CI run 39007746312 before branching.
- [x] Review batch 51fcedc and registration 37189f7 without wholesale integration; record reusable work and rejected assumptions in docs/priority-account-integration.md.
- [x] Add PRD R1–R4 contracts and AT-R0/R1/R2a/R2b/R3/R4/R5 acceptance mapping; update agent instructions.
- [x] Verify PR #11 merged and main 842c156 CI 39008257784 passed before the R1 feature branch.
- [x] Implement R1 request/clinic-scoped P1–P4 priorities, history/backfill and authorized UI/API merged in PR #12. Historical R1 validation is in VALIDATION.md; Phase 7 now implements group notifications.
- [x] Implement R3/R4 on feat/accounts-clinic-access (pending review): persisted accounts/session/logout, explicit Demo Mode, trusted mock admin bootstrap, invited staff approval/revocation and transaction-level clinic access checks. Main 1ac6f91 CI 39009829055 passed before branching.
- [x] Phase 7 supersedes manual R2: implement authorized automatic P1–P4 sequences, durable scheduling, clinic management, competitive acceptance and interval guards. Review PR pending.
- [x] Execute R1 slice of R5: isolated upgrade/SQL/concurrency, 39 unit, 38 PostgreSQL and 14 browser tests, lint/typecheck/build and production restart persistence; see VALIDATION.md.
- [x] R3/R4 checks: 41 unit / 45 PostgreSQL / 17 browser tests, lint/typecheck/build, account/demo session and booking/priority restart persistence; see VALIDATION.md.
- [x] Phase 7 regression: 43 unit, 63 PostgreSQL integration and 18 browser tests, lint/typecheck/build/format and production/worker restart persistence passed.

Sole owner is user + Codex. Feature PRs follow the dependency order in the PRD October 17 table. Documentation tests do not establish that runtime requirements pass. No shared migration, reset/reseed or account provisioning in this PR.

## Subsequent tasks and dependencies

Implement the following only in later authorized scopes. Cut optional AI, deposits, tours and specialty breadth before reducing integrity or internal-release controls. Preserve the original Avery/Harbor/Cedar workflow throughout.

| Task                                     | Deliverable                                                                                                                                                                                                                                               | Dependency and acceptance gate                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0 — preservation/hardening              | Keep Phase 1 fixes. Reconcile useful local review tests onto current history schema; stronger post-lock PostgreSQL clock, real lock-wait tests, SQL match-failure/read recovery, explicit retry and targeted occupancy/notification ownership constraints | Baseline first; legacy AC01–15 plus AT-BP07/08 protection subset. No applied migration edits or implicit demo upgrade.                                                                  |
| T1 — additive contracts/data             | Stable CareNeed/enrollment, service specification/duration, specific plan IDs, target-clinic EligibilityReview, attendance preferences, network consent/membership, policy/release stages, clinician provenance and structured events                     | T0; agree PRD sections 5/7 contracts before code. Legacy backfill must not invent consent or eligibility. Clean-install/upgrade tests in isolation; shared rollout separately approved. |
| T2 — prescreening/multi-need engine      | Rules for service variant/duration/plan/price/location/time/referral/auth/arrival; unknown required flags fail closed, deterministic missing-fields checklist, multiple independent needs                                                                 | T1; AT-BP01/02/06 and rules portion of BP09. Revalidate book/approve/accept.                                                                                                            |
| T3 — internal-first release/staff stages | Clinic policy editor, internal queue and deadline, explicit authorized external release, membership/consent gates, staff-selected eligible cohorts with clinician-sourced markers, stable FIFO/ID ties                                                    | T1/T2; AT-BP03/04/05. Deadline alone must never release externally. Search/direct booking must obey same audience gate.                                                                 |
| T4 — configurable safe offers            | Policy/eligibility snapshots, bounded configurable expiry, execution-time checks, atomic original→replacement history/event writes, preserve independent nonconflicting needs/offers, idempotent same responses                                           | T0/T2/T3; AT-BP07/08 plus AC02/06/07/08/13/14/15. No split acceptance transaction.                                                                                                      |
| T5 — patient/clinic integration          | Multiple-need and enrollment UI, exact-plan/requirement badges, opt-in, clinical marker provenance, staff checklist/release confirmation/stage preview, durable inbox and history, fee-zero and simulation copy                                           | T1 contracts, then each service slice. All visible actions persist; inaccessible UI never substitutes for server authorization. Keep landing and internal portals separate.             |
| T6 — fixtures/quality/rehearsal          | Named synthetic internal-priority, exclusion, expired/declined, no-match, SQL-failure, concurrency and independent-needs scenarios; end-to-end and raw-SQL integrity tests, persistence and two rehearsals                                                | Incremental with T0–T5; legacy AC01–15 and BP01–08/13. Reset fixtures only in isolated tests or separately approved explicit demo reset.                                                |
| T7 — clinic impact/financial scenarios   | Structured recovery attribution, denominators, internal/network recovery, recancellation handling, elapsed time-to-fill/earlier days; labeled hypothetical baseline/admin effort/financial inputs                                                         | T1 events + working T4. AT-BP10/11: no inferred actual completed visits/ROI, no double counts, patient platform fee $0, no live billing.                                                |
| T8 — optional notes AI                   | Authorized synthetic-note summaries and missing-info assistance, minimized external input, no clinical or booking mutations, provider/error/no-key fallback                                                                                               | Only after core T0–T7 gates; AT-BP09. Rules-based checklist remains functional if omitted.                                                                                              |
| T9 — deferred deposit design             | Optional refundable deposit with equivalent waiver, refund/dispute handling, fairness and legal review                                                                                                                                                    | After core, separate scope/approval. AT-BP12 currently requires a deposit-free core flow, not payment code.                                                                             |

## Concrete milestone sequence

1. **Completed Phase 2:** documentation + public landing merged in PR #9. Preserve all baseline behavior. Current Phase 3 adapts onboarding and fictional insurance comparisons.
2. **Next integration:** R1 four-level request priorities; R3 individual accounts and explicit Demo Mode; R4 administrator-approved clinic staff; then R2 manual group engine/UI. Reuse forms and notification ideas selectively, never public self-granted staff or placeholder authentication.
3. **Qualified internal clinic slice:** T1/T2 minimum contracts, one low-complexity service, internal queue and staff stage → offer → patient response. T5 UI and T6 tests accompany services.
4. **Authorized network slice:** T3 explicit release/consent plus T4 atomic cross-clinic replacement. Retain independent needs, original protection, expiry, no-match and concurrency cases.
5. **Impact and rehearsal:** T7 minimal dashboard and T6 final safety/claim/accessibility checks. Rehearse from explicitly approved fixtures; group sends retain the fixed 180-minute guard. Use controlled clocks only in isolated tests.
6. **Optional adaptation:** separate language provider/strings from batch state semantics; retain the Phase 3 fictional calculator/calendar adaptation and optional guide; integrate future coverage changes without implying real verification. T8 notes AI and T9 deposits remain below core.

## Branch and migration review gates

The batch branch uses 0003_notification_batches while main already has 0003_priority_scoring. Directory names are checksum keys, but application semantics differ too: batch permits multiple pending reservable offers and first-response wins, whereas current baseline uses one exclusive offer. The October 17 contract now requires competitive P1–P4 group invitations with a single capacity winner and manual 180-minute sends; establish its complete replacement invariant before changing the SQL or invitations. Preserve useful group-selection UI/localization and tests without silently weakening occupancy/fairness safeguards.

Registration has 0004_demo_registration and 0005_clinic_notifications; inspect the actual target ledger before any later additive migration. Never rename/edit already-applied SQL or assume branch numbering proves compatible upgrade order. This roadmap PR does not modify any schema/migration file. No shared reset/reseed/migration by implication; future database impact must be explained and approved separately.

## Traceability and definition of done

Canonical requirement/status/task/test table: PRD section 3; acceptance definitions: section 9. Coverage: BP01→T1/T2/T5; BP02→T1/T2/T5; BP03→T1/T3/T5/T6; BP04→T1/T3/T5; BP05→T1/T3/T4/T5; BP06→T1/T2/T4/T5; BP07→T0/T3/T4/T5; BP08→T0/T4/T6; BP09→T2/T8; BP10→T1/T7/T6; BP11→T5/T7; BP12→T9; BP13→T5/T6/T7/T8. Each BPnn maps to AT-BPnn. Planned test IDs are not passing evidence.

Each PR states concrete behavior, related task/BP/acceptance IDs, actual tests and limitations, screenshots for visible changes, API compatibility and later migration rollout if relevant. Done requires persisted usable behavior, tested authorization/invariants, failure states and truthful synthetic labels. Only user and Codex handle work. No direct main pushes, automatic merges, force-push/history rewriting or public deployment.

See PRD October 17 R1–R4 requirements and incremental PR/AT-R* table for the superseding priority, account and group contracts. T1/T3/T4/T5/T6 must implement these together with existing BP requirements; old single-exclusive and 30-minute proposals do not apply to the new group path. Internal-before-network authorization remains a distinct gate, not automatically implemented by this roadmap.

## Phase 7 review checklist

- [x] Successful latest-main Actions gate verified; dedicated feature branch.
- [x] Shared candidate preview, human-approved request/clinic groups, exact authorized recipient snapshots.
- [x] Durable automatic scheduling, actual-send timestamps, empty-group skip, overdue recovery, no catch-up burst, pause/resume/cancel/reauthorize.
- [x] Atomic committed fill termination, competitor revocation, safe original replacement and blocked direct-booking bypass.
- [x] Staff controls/history/warnings, real in-app patient notifications and truthful competition/expiry text.
- [x] Additive migrations only, preserved legacy pending exclusive offers, independent isolated fixtures and tests.
- [ ] User review and merge of Phase 7 PR; no automatic merge.
- [ ] Separately authorize shared-database migration and supervised worker rollout. No shared migration/reset/reseed was performed.
- [ ] Later impact dashboard: explicitly not started; wait for Phase 7 review/merge.

See VALIDATION.md for executed checks and limitations; documentation acceptance tables from older phases do not establish Phase 7 test results.

## Patient UX redesign implementation

- [x] Remove the symptom questionnaire and summary from normal patient screens; remove intake completion gates on booking, waitlist and acceptance. Retain historical data and legacy compatibility without migration/deletion.
- [x] Replace patient monthly/icon calendar with earliest-first text/category search and readable appointment cards; preserve insurance/date/location/cost comparisons and actual detail/booking actions.
- [x] Add honest empty categories and service-prefilled waitlist registration. Keep Vaccination/Blood test available as request/slot service strings without reseeding existing data.
- [x] Center navigation on booking, earlier-care requests and management; retain inbox and optional Quick tour, remove duplicate onboarding panel, provide immediate earlier-request action.
- [x] Adapt obsolete questionnaire/calendar assertions while preserving acceptance checks; add search ordering/categories/zero-intake/navigation/original-protection browser coverage.
- [ ] User review and merge of the focused feature PR. No automatic merge, deployment or shared database reset/reseed.

### Latest-main PR #15 compatibility

PR #15 merged during development (main f5212eb, successful CI). Preserve its canonical service identifiers Vaccination, Blood test and Routine examination, existing-booking prefilled earlier-request shortcut and /patient, /earlier, /needs, /health-information routes. The task hub remains accessible; normal login opens search directly. The health-information page preserves historical self-report, adds approved clinician tags in Phase 8 Part A, and leaves imports for PR2: PR #15's optional questionnaire is explicitly superseded by the latest user requirement and removed. Patient task labels use the three standardized appointment/waitlist activities. Existing/new PR #15 safety tests remain, adapted only for this intentionally removed optional questionnaire and search interface.


## Phase 8 Part A — functional clinician-authored tags

- [x] Start from CI-verified main 3f36058 (merged PR16/PR17); isolated feature branch.
- [x] Add MedicalNeed, clinician-authored MedicalTag and append-only version snapshots through additive migration 0008. Preserve Intake, SymptomTag, accounts, bookings, priorities and sequences.
- [x] Explicit administrator clinical-author grant/revoke, active membership checks, same-clinic started-visit sources, patient read-only approved records and minimal scheduling evidence.
- [x] Functional create/edit/approve/retire clinic UI, audit history, patient health-information view, navigation and guided tours. Editing returns approved content to draft.
- [x] Preserve search-first no-questionnaire patient UX, staff-approved priorities, eligibility checks, notification intervals and atomic scheduling.
- [x] Lint/typecheck/build, 51 unit tests, 78 isolated PostgreSQL integration tests, 23 browser tests and production/worker persistence rehearsal passed.
- [x] Part A reviewed and merged as PR #21. No automatic merge/deployment or shared database changes.
- [x] PR2: patient-authorized synthetic FHIR-compatible record import, local text search/extraction and clinician review (PR #25 merged).
- [x] PR3 implementation: external appointment references, independent scheduling for multiple needs and advanced service eligibility. Current Part C feature PR still requires review.

Implementation is approved. Cloud deployment, Neon initialization, Vercel and Cloudflare configuration remain separate tasks requiring their own authorization. Validation results for this branch are recorded in docs/medical-tags.md after actual checks.


## Phase 8 Part B — authorized synthetic record import

- [x] PR21 merged; verified main 429cee0 CI success before creating feat/phase8-synthetic-record-import.
- [x] Patient-explicit, clinic-specific synthetic FHIR import for new accounts without existing visits/tags; retry-safe consent grants, revocation and retained private archive.
- [x] Keyword/PostgreSQL full-text record search, deterministic scheduling evidence extraction and optional validated loopback-only AI with reliable fallback.
- [x] Functional patient source/provenance view and clinical correction/approval/rejection UI; separate pending suggestions from confirmed Part A tags and human P1–P4 review.
- [x] Additive 0009–0010 migrations, source/review immutability, scoped access, audit history and transaction rollback/concurrency protection.
- [x] Final checks: 68 unit tests, 92 PostgreSQL integration tests, 25 browser tests, lint/typecheck/build/format/diff and production/worker persistence passed; results in VALIDATION.md.
- [x] Part B reviewed and merged as PR #25. No automatic merge, public deployment or shared database operation.
- [x] Part B reviewed/merged as PR #25; latest main CI succeeded before Part C development.


## Phase 8 Part C — functional independent patient scheduling

- [x] Patient-owned scheduling needs, original/current booking links and unverified external reports; additive migration 0011 with no historical backfill.
- [x] Separate same-service requests, preferences and explicit approved clinical evidence per need.
- [x] Scoped atomic replacement, competing acceptance guards, original preservation and manual external cancellation guidance.
- [x] Optional referral/authorization requirements, saved-plan enforcement and visible incompatibility warnings.
- [x] Patient/clinic permissions, optimistic versions and immutable per-need history.
- [x] Patient UI at /needs plus appointment/waitlist/inbox/priority integrations; no symptom gate.
- [x] Unit, PostgreSQL migration/concurrency/authorization, Chromium and restart persistence coverage added. Executed results are recorded in VALIDATION.md.
- [ ] Human review and merge of this feature PR; never automatically merge.
- [ ] Separately authorized shared database rollout/public deployment. No shared database was modified during implementation.

Contracts: docs/patient-needs.md. Application implementation is approved; deployment remains separate.
