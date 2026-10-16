# Careousel proposal-alignment roadmap

Status: documentation review, 2026-10-16. Product source and requirement/acceptance traceability: PRD.md sections 1, 3 and 9. This branch changes documentation only. A task below is not implemented merely because its design is documented. No application commit, database migration, merge or public deployment is part of this PR.

## Existing baseline and integration boundary

Remote `feat/careousel-prototype` at `27c5f83` already contains patient/staff portals, filtering, booking, linked/unlinked waitlists, deterministic matching, staff-approved exclusive offers, persistent inbox, atomic replacement, synthetic seeds, demo sessions, origin protections and test harnesses. `cd509fb` adds scheduling fixes and migration `0002_booking_history_patient_integrity`. Preserve them. Refer to VALIDATION.md for historical results, not new proposal acceptance.

The original local worktree contains different uncommitted SQL-clock/history/integrity fixes based on `e063f38`. Keep it intact. Its reverse history field and alternative 0002 migration cannot be copied over remote migrations blindly. T0 reconciles behavior and tests, not Git history. No user-approved commit/push of that local application work is implied by this docs PR.

## Five-person responsibilities and review pairs

| Member                           | Primary deliverables                                                                                      | Review / coordination                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1 — data and integration         | T0 integration plan, T1 schema/backfills/constraints, shared typed contracts, migrations and CI           | Member 4 reviews database invariants; sole migration integrator                         |
| 2 — patient experience           | T2 patient preference/eligibility inputs, T5 patient need dashboard/search/inbox/fee copy                 | Member 3 reviews patient usability; coordinate contracts before UI                      |
| 3 — clinic experience and impact | T3 clinic policy/release/stage UI, T5 staff checklist, T7 impact UI and formulas                          | Member 2 reviews accessibility; Member 4 reviews scheduling semantics                   |
| 4 — scheduling services          | T0 correctness reconciliation, T2 prescreen engine, T3–T4 audience/offer/acceptance transactions          | Member 1 reviews locks, ownership and migrations; no parallel conflicting service edits |
| 5 — quality and demonstration    | T6 fixtures/integration/browser/claim checks, regression evidence, demo rehearsal; optional T8 validation | Pairs with every owner; reviews critical T0/T4 failure cases                            |

These are student ownership suggestions, not instructions to spawn agents. Actual names, available hours and deadline remain open. One reviewer per feature; Members 1/4 jointly review changes to scheduling invariants. Member 1 owns `schema.prisma`, migrations and shared contracts; Member 4 owns scheduling.ts edits. Use small dependent PRs and coordinate shared files rather than overwriting them.

## Dependency path and milestone gates

`Docs review → M0 preserve/reconcile → M1 contract/schema → M2 internal-first qualified workflow → M3 authorized network safe replacement → M4 impact/hardening/rehearsal → optional assistance`

No calendar estimates are promised without deadline/availability. Implement one vertical slice before extending all services. Keep original functions available. If time is short, cut notes AI, deposits, new specialty breadth and richer visuals; never cut transaction safety, internal-release permission or honest labels.

### M0 — protect the existing working application

- [ ] **T0** (Members 1/4, tests Member 5): compare remote/local fixes, migration ledger and auth changes without overwriting either worktree. Adopt remote history direction or explicitly reviewed compatible alternative; no duplicate 0002 histories. Preserve successful Codespaces login origin behavior.
- [ ] Upgrade post-lock authoritative execution time to PostgreSQL clock_timestamp; retain lock and add real lock-wait acceptance/direct-book/approval regression tests.
- [ ] Fault-inject actual SQL matching failures after cancellation, retain durable cancellation and usable read snapshots, add explicit safe retry; preserve replacement's single transaction.
- [ ] Review notification patient ownership, mixed booking/hold occupancy, history consistency and direct SQL risks with targeted tests; don't add broad infrastructure without demonstrated need.

Deliverable/gate: reconciled small correctness PR, no regressions in legacy AC01–AC15, AT-BP07/08 protection subset passes on isolated PostgreSQL. No migration applied to shared/demo DB without reviewed preflight and approval. This docs PR does not execute T0.

### M1 — contracts and additive data (depends on M0)

- [ ] **T1** (Member 1; review 4): finalize PRD section 5 entities and section 7 Zod/response contracts with Members 2/3 before parallel UI work.
- [ ] Add stable CareNeed/enrollment, service specification/duration and specific demo plan IDs; replace service-only active uniqueness with need/enrollment-level uniqueness safely.
- [ ] Add simulated target-clinic EligibilityReview and attendance preferences; internal/network consent/membership, ClinicPolicy, OpeningRelease, clinician marker provenance, stage recipients and structured events.
- [ ] Map legacy strings and history without invented approvals/consent. Unknowns fail closed; add dry-run preflight and deterministic conversion tests. Keep old request adapter until callers migrate.
- [ ] Create new additive migration(s) using next unused names, preserve applied checksums and actual rows; validate clean install and upgrade fixtures on isolated DB. Document whether new generated client can run before target DB migration.

Deliverable/gate: reviewed schema/API diff, backfill plan and upgrade tests; application still builds with original workflow. No actual migration exists from this documentation milestone. Decide rollout separately before changing current demo DB.

### M2 — one qualified internal-clinic workflow (depends on M1)

- [ ] **T2** (Member 4 engine, Member 2 forms): service variant/duration, plan, price, clinic-local dates/hours, arrival lead time, referral/auth states and expiry; missing-fields checklist and staff target-clinic administrative review. Required unknown flags block book/approve/accept.
- [ ] **T3** (Member 4 services, Member 3 UI): cancellation creates internal release and policy snapshot; internal enrollment enforced in search, snapshots, direct booking and offer actions. Policy editor shows configurable window, interval and offer duration.
- [ ] Add clinician-authorized marker permission/provenance, staff-selected cohort with stable FIFO/ID ties and staged deadlines. Default sequential exclusive actionable invitations, not broadcast slot races.
- [ ] **T5 internal slice** (Members 2/3): multiple need cards, requirements badges/checklist, internal queue, stage preview and durable inbox. All buttons call services, including retry and error states.
- [ ] **T6 internal slice** (Member 5): synthetic internal candidates, marker ties, missing/expired referral/auth, wrong duration/variant, unable-to-arrive and stage timing tests.

Deliverable/gate: internal cancellation→prescreen→staff stage→patient response works through UI; AT-BP01/02/05/06 plus internal BP03/04/07 pass. New screens remain responsive/keyboard usable. No cross-clinic release bypass.

### M3 — explicit network release and atomic earlier replacement (depends on M2)

- [ ] **T3 network slice**: expiry of internal window permits review only. Own-clinic staff explicitly authorizes release; require network membership, patient consent and no conflicting live hold. Revocations invalidate affected offers safely.
- [ ] **T4** (Member 4, review 1): offer policy/version snapshots and bounded expiry; post-lock time, full prescreen/audience revalidation, atomic original→replacement chain/event writes. Fulfill only the accepted need; preserve unrelated nonconflicting offers/needs.
- [ ] Keep accept/decline/release/stage retries idempotent, reject contradictory actions, serialize competing responses/approval/direct booking. Durable deadlines work after restart; lazy staff-driven stage progression is labeled honestly.
- [ ] **T5 network slice** (Members 2/3): explicit opt-in and clinic source, external-release confirmation, internal/network status, authoritative offer expiry and clear replacement consequences; preserve legacy details/schedule/history.
- [ ] **T6 network slice** (Member 5): negative direct-API bypass tests, stale requirement/consent changes, no-match, concurrent releases/responses, repeated rescheduling and independent-needs preservation.

Deliverable/gate: complete PRD section 8 Avery/Harbor/Cedar workflow and AT-BP01–08 pass without external APIs or manual DB edits. Original appointment survives every failed acceptance.

### M4 — impact, claims and release rehearsal (depends on M3)

- [ ] **T7** (Member 3 UI/formulas, Member 1 event writes, Member 5 assertions): observed internal/network recovered openings, denominators, time-to-fill, earlier elapsed days and reversal handling from structured events.
- [ ] Add clearly simulated baseline incremental recovery, admin minutes and financial scenarios. Separate assumed completed-visit value from confirmed-booking counts; no causal/actual profit claims. Label patient platform fee $0 and medical cost estimate separately.
- [ ] **T6 final** (Member 5): stable named synthetic scenarios for internal decline→external release, missing requirements, concurrent actors, expired offers under real lock wait, no-match and matching failure, retaining legacy Avery fixture. Never reseed current demo DB without approval.
- [ ] Run unit, real PostgreSQL integration/direct SQL, browser, lint, typecheck and build; persistence/restart and fresh/upgrade migration checks. Report results in validation evidence in a later implementation PR, not invented here.
- [ ] Perform manual claim/accessibility review at 375px and keyboard navigation. Two team rehearsals use actual demo machine; short configurable windows are explicitly synthetic. Prepare local fallback.

Deliverable/gate: AT-BP01–08/10/11/13, legacy AC01–15 and all critical checks pass with honest limits. AT-BP09 fallback checklist passes even if optional LLM notes work is omitted. Review PRs only; no merge or deployment implied.

### Optional follow-up, deliberately outside core gate

- [ ] **T8** (Members 4/5, after M4): extend existing optional recommendations into authorized synthetic administrative-note summary and missing-info assistance only if time remains. Access checks before retrieving/sending data; no clinical classification, treatment approval or scheduling mutation. Test no-key/timeout/provider/malformed output and note-injection/cross-clinic access. AT-BP09; core checklist remains rules-based.
- [ ] **T9 deferred** (team/legal/fairness review after M4): optional refundable deposit with equivalent waiver access, refund/dispute states and reliability evidence. Do not add schema/provider/payment screens now. AT-BP12 is the no-deposit core gate; implementation requires a separate approved design.
- [ ] Real clinic integrations, production identity/security/compliance, live insurance/payment/billing, background external messaging, maps and broad service expansion need separate scope and authorization. No production readiness is inferred from hackathon tests.

## Traceability coverage and definition of done

Canonical full table: PRD.md section 3. Coverage index: BP01→T1/T2/T5; BP02→T1/T2/T5; BP03→T1/T3/T5/T6; BP04→T1/T3/T5; BP05→T1/T3/T4/T5; BP06→T1/T2/T4/T5; BP07→T0/T3/T4/T5; BP08→T0/T4/T6; BP09→T2/T8; BP10→T1/T7/T6; BP11→T5/T7; BP12→T9; BP13→T5/T6/T7/T8. Each BPnn maps to AT-BPnn; all are specified in PRD section 9. No traceability row is a passed-test claim.

Each feature PR states behavior, task/BP/acceptance IDs, schema/API changes, compatibility and migration rollout, tests actually run, screenshots for visible changes and remaining limitations. Done requires persistent UI behavior, server authorization, tested invariants, meaningful failure states and truthful synthetic labels. Schema owner reviews migration ordering and shared-file changes; review partner checks cross-workstream integration. Do not force-push, rewrite history or push directly to main. Do not merge PR #3/#4 or deploy without separate explicit approval.

## Decisions needed before implementation

Review PRD D02/D06/D07/D08/D09 for pilot service, deadline, window/stage defaults, clinician authority and need/enrollment UX; D10 assigns real owners. D12 requires history/migration reconciliation and explicit shared-demo rollout approval. D11 prices/metrics remain assumptions, not real billing. D13 keeps deposits and notes AI out of the core slice. These decisions do not block publishing this documentation review PR.
