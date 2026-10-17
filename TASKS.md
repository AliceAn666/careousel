# Careousel proposal-aligned development roadmap

Ownership: **the user working independently with Codex**. No five-person assignments, teammate requests or agent delegation. October 14, 2026 business proposal is the product source of truth; see PRD.md for source fingerprint, current-state gaps and BP01–BP13 → tasks → AT-BP01–AT-BP13 traceability. A planned task is not an implemented feature.

## Current integration boundary

- Phase 1: PR #8 merged into main `3e49886`; main CI run 39005432827 passed before Phase 2 began. Preserve intake gate, calendar search, combined appointments/waitlists, explicit original-booking selection, atomic replacement, no-reset navigation/session behavior and isolated-test protections.
- Phase 2 (`feat/phase2-proposal-landing`): selectively integrate PR #5 requirements and PR #6 public landing presentation. Adapt role entrances and tests to the current app, never replace current app/service snapshots wholesale. No schema or migration changes, registration implementation, batch notifications, tours, deployment or automatic merge.
- Registration, bilingual/batch and guided-insurance branches remain future work. Current main has no registration endpoint. Inventory and migration risks remain in docs/final-integration.md.
- Uncommitted original-worktree SQL-clock/history/integrity patches are reference work only; preserve their files. Their reversed history relation and alternative migration names must not be applied over main blindly.

## Phase 2 completion gate

- [x] Verify PR #8 merged and exact latest-main CI successful before branching.
- [x] Adapt PRD/AGENTS/TASKS to proposal requirements, current baseline and sole ownership.
- [x] Integrate independent landing component/styles, patient-first hero, working anchors, patient and clinic entrances, synthetic labels and existing-session continuity.
- [x] Retain Phase 1 tests; change only public entrance selectors where necessary. Extend landing tests for new and returning personas, intake gate, clinic scope, browser refresh, keyboard/mobile/reduced-motion and state outage/retry.
- [x] Run lint/typecheck/unit/PostgreSQL integration/browser/build and production restart persistence; actual results are recorded in VALIDATION.md.
- [ ] User review of the Phase 2 PR targeting main; do not merge automatically. No change to shared demo data or migration files.

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

1. **Current Phase 2:** documentation + public landing, preserving all baseline behavior. Review PR first.
2. **Next integration:** adapt synthetic registration/clinic notifications behind existing sessions, with honest demo identity wording and scoped tests. Preserve safe reset and intake behavior; remove any inherited automatic restart code.
3. **Qualified internal clinic slice:** T1/T2 minimum contracts, one low-complexity service, internal queue and staff stage → offer → patient response. T5 UI and T6 tests accompany services.
4. **Authorized network slice:** T3 explicit release/consent plus T4 atomic cross-clinic replacement. Retain independent needs, original protection, expiry, no-match and concurrency cases.
5. **Impact and rehearsal:** T7 minimal dashboard and T6 final safety/claim/accessibility checks. Rehearse from explicitly approved fixtures with visibly synthetic short timing policies.
6. **Optional adaptation:** separate language provider/strings from batch state semantics; port fictional insurance calculator to calendar/details before optional tour. T8 notes AI and T9 deposits remain below core.

## Branch and migration review gates

The batch branch uses 0003_notification_batches while main already has 0003_priority_scoring. Directory names are checksum keys, but application semantics differ too: batch permits multiple pending reservable offers and first-response wins, whereas current baseline and proposed staged model use a single exclusive offer. Decide the contract before changing the SQL or invitations. Preserve useful group-selection UI/localization and tests without silently weakening occupancy/fairness safeguards.

Registration has 0004_demo_registration and 0005_clinic_notifications; inspect the actual target ledger before any later additive migration. Never rename/edit already-applied SQL or assume branch numbering proves compatible upgrade order. Phase 2 does not modify any schema/migration file. No shared reset/reseed/migration by implication; future database impact must be explained and approved separately.

## Traceability and definition of done

Canonical requirement/status/task/test table: PRD section 3; acceptance definitions: section 9. Coverage: BP01→T1/T2/T5; BP02→T1/T2/T5; BP03→T1/T3/T5/T6; BP04→T1/T3/T5; BP05→T1/T3/T4/T5; BP06→T1/T2/T4/T5; BP07→T0/T3/T4/T5; BP08→T0/T4/T6; BP09→T2/T8; BP10→T1/T7/T6; BP11→T5/T7; BP12→T9; BP13→T5/T6/T7/T8. Each BPnn maps to AT-BPnn. Planned test IDs are not passing evidence.

Each PR states concrete behavior, related task/BP/acceptance IDs, actual tests and limitations, screenshots for visible changes, API compatibility and later migration rollout if relevant. Done requires persisted usable behavior, tested authorization/invariants, failure states and truthful synthetic labels. Only user and Codex handle work. No direct main pushes, automatic merges, force-push/history rewriting or public deployment.
