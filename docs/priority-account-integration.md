# Priority, group invitations and account integration review

This review originated in documentation PR #11. The current R1 feature branch implements request-scoped four-level priorities, history, UI and tests as detailed in PRD R1 implementation boundary; account/group mechanisms below remain planned. Explicit October 17 requirements supersede earlier proposals. Sole owner: user + Codex.

## Inspected baseline and reusable branches

- Main after PR #10: 74e6c903f32b227da721d51055f73c4bd7af2aeb, preserving Phase 1/2 and the completed onboarding/insurance integration. Current source has patient-wide SymptomTag scores, one pending exclusive Offer per Slot, signed demo persona sessions and no credentialed signup.
- feat/batch-notifications-bilingual at 51fcedc: reusable staff recipient-selection UI, language dictionary/provider, group-invitation messaging, offer/notification idempotency and concurrency test ideas. Do not copy snapshots of careousel-app, patient-portal, clinic-portal or scheduling.ts over current main.
- Its advanceBatches() automatically creates the next round when no pending offers remain; reads/worker reconciliation can drive it. Its two groups (priority/general), 1–60 minute interval constraint and automatically shortened response windows do not implement four manually sent groups with a fixed 180-minute inter-send guard. Reuse eligibility and recipient checks only after adaptation. Reject automatic sends and omit the worker from delivery authorization.
- Its 0003_notification_batches relaxes one_pending_offer_per_slot and adds a partial uniqueness/trigger scheme. Main already has 0003_priority_scoring. Different directory names do not imply safe semantic coexistence: inspect all booking writers, existing holds and current migration ledger, then create a new additive migration with a tested replacement invariant. Do not import old SQL wholesale.
- feat/registration-clinic-notifications at 37189f7: reusable form validation/layout, synthetic clinic notification UI/schema concepts, appointment calendar and authorization test cases after adaptation. Its registerPersona() has no real password authentication (the UI password is a placeholder) and public clinic signup creates a STAFF identity plus six slots. Do not reuse this privilege path, placeholder password, automatic clinic/slot provisioning or arbitrary role selection.
- Registration's 0004_demo_registration and 0005_clinic_notifications are not an agreed migration sequence for main. Inventory reusable columns/tables; choose fresh additive migrations against the actual merged schema. The existing synthetic clinic may gain accounts through an approved administrator bootstrap, never a public clinic selector.

## Likely overlaps and contract changes

Shared overlapping files: prisma/schema.prisma, seed-data.ts/seed.ts, src/components/careousel-app.tsx, patient-portal.tsx, clinic-portal.tsx, ui.tsx, globals.css, src/server/services/scheduling.ts, auth/session.ts, src/lib/config.ts and integration/priority fixtures. Preserve current landing styles, onboarding.module.css, coverage/search utilities and session/reset fixes. Prefer new isolated modules/components and thin adapters, avoiding whole-file conflict resolution by selecting either branch's version.

- Replace numeric setTag priority editing with setWaitlistPriority({waitlistId, clinicId, level:P1|P2|P3|P4, expectedVersion, reason}); server derives authority from current membership. Reject arbitrary patient-wide priority updates. Keep legacy intake storage without clinical urgency inference.
- GET groupPreview(slotId/releaseId) returns authorized clinic-scoped groups, eligible/excluded recipients, approval/version, capacity, lastSentAt, nextEligibleAt, serverNow and expiry-risk warning. Preview performs no delivery and does not expose other clinics' unrestricted patient data.
- approveGroup({sequenceId, level, recipientIds, expectedVersion, reason}) persists review only. sendGroup({groupId, expectedVersion, operationKey}) explicitly authorizes one all-or-nothing send, rechecks actual post-lock time and eligibility, returns durable sentAt/nextEligibleAt/offers. Same key returns the same result, stale version conflicts. Timer/worker cannot call as a substitute for a clinic actor.
- Existing /api/actions respond accepts existing offer IDs, but must recognize group invitations without assuming exclusive ownership of Slot. All direct-book/legacy-approve/expiry/cancel/withdraw paths must observe shared capacity and audience constraints. Add explicit state/version fields; preserve response compatibility until all clients are migrated.
- New account register/login/logout endpoints validate inputs and keep role assignment server-owned. Patient registration accepts no privileged role/clinic assignment. Staff entrance authenticates an already invited approved account, not self-enrollment. Existing /api/session userId endpoint becomes explicit Demo Mode-only, while signed demo session compatibility is documented during rollout.
- Admin invitation endpoints create/revoke/list invitations and approve/revoke memberships for own clinic only, with operation-key/token-reuse protections. Staff/data access rechecks active membership on every request, not a role claim in the cookie. Simulated invitation delivery remains in-app; no external email is authorized by this roadmap.

## Safe PR order

1. Roadmap/docs review (completed in PR #11).
2. Request-scoped four-level priorities, no group occupancy relaxation. Introduce history/backfill and staff UI together.
3. Individual account sessions and explicit Demo Mode, then administrator invitations/approval/revocation. These can be separate PRs, with actual clinic authority ready before activating group delivery.
4. Group state machine + revised integrity constraints + staff preview/manual send + patient acceptance together if needed to avoid an unsafe partial rollout. Fixed 180-minute timing; no automated next group. Separate UI polish only after the complete safe state machine exists.
5. Isolated upgrade/concurrency/end-to-end rehearsal and documentation of observed versus simulated behavior; PR review, never automatic merge/deployment.

Each implementation PR starts from the latest successful main, preserves all existing safety assertions (adapting intentional UX expectations with equivalent coverage), and reports actual checks. Schema migration files in review do not authorize running them against the shared database. No shared reset/reseed, account bootstrap, migration or fixture expansion occurs in this documentation slice. No invitations are sent externally.

## R1 feature adaptation

Current R1 does not import either feature branch. It retains current scheduling writers and exclusive Offer constraints, replaces numeric setTag/deleteTag priority mutations with strict setWaitlistPriority, and restricts staff request/history projection to their clinic. Old Intake/SymptomTag rows and migration checksums are preserved. New intake saves raw answers without computed urgency; patients can still see symptom labels. Request preference edits trigger documented re-review with history. New migration 0004_waitlist_priority_levels uses current schema names and is tested only in isolation, not applied to shared data. Accounts and timed group sends follow in separate feature PRs after reviewed merge and green main.
