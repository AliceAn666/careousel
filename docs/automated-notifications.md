# Phase 7 operational guide

Current policy supersedes older manual-per-group/internal-first proposal plans. No automatic merge, public deployment, impact dashboard or shared database rollout is authorized by this implementation.

## Working flow

1. A cancellation or newly created available opening is matched against all eligible participating-clinic requests. Prior attendance at the offering clinic gives no preference. Service, plan, budget, clinic/city preferences, local time/date/weekdays, conflicts and strictly earlier linked replacement rules remain authoritative.
2. Authorized staff use Request priorities for request + offering-clinic P1–P4 decisions, reason/history and optional synthetic referral/authorization clearance. Unknown required clearance fails closed; an unreviewed priority has no group. Priority assignment itself never sends an invitation.
3. In Waitlist Management → Notifications, preview the selected opening. Review four groups/exclusions, check the exact recipients, select first group and reason, authorize once. First eligible nonempty approved group sends immediately; earlier groups intentionally omitted by the first-group choice are recorded as skipped.
4. Run `npm run worker:notifications` separately from `npm run dev` / `npm start`. The worker executes only persisted authorized snapshots. Every 15 seconds it checks PostgreSQL; `--once` supports cron. Reads, browser countdowns and patient responses never advance a group.
5. At previous actual send + 180 minutes or later, revalidate slot, authority, decisions and eligibility; send one next nonempty approved group. Empty groups have no sentAt and do not reset the clock. Delayed processing schedules from the delayed actual send, never from the originally planned time. Previous unexpired invitations still compete.
6. A committed successful acceptance atomically confirms one booking, reschedules only the linked original, fulfills the request, marks the slot BOOKED, completes the sequence, cancels future groups and revokes competitors with explanatory notices. A failed transaction changes none of those records. Losing patients keep their original booking. Other unrelated appointments and nonconflicting offers are preserved.

## State and authorization rules

Draft is the unsaved preview (no authorization/job exists). Start persists SCHEDULED and normally immediately becomes ACTIVE. ACTIVE/SCHEDULED jobs can pause; PAUSED has no nextSendAt, but already delivered invitations remain valid. Resume reauthorizes the same snapshot with current clinic authority and preserves the interval. A changed preference/priority version pauses before sending; fresh preview/selection/authorization can replace only unsent groups, with a firstGroup later than previously sent groups. Old sent groups/actual times remain immutable through these controls. Changing a decision revokes its existing competitive invitations; new decisions never silently join an authorized list.

Inactive/withdrawn/no-longer-eligible recipients are skipped without substitute patients. Revoked sequence author pauses with a staff warning; revoked decision assigner excludes affected recipients. No eligible recipients means SKIPPED plus a durable warning/audit, with no fake timestamp. COMPLETED means capacity filled **or all approved groups exhausted**; unexpired already sent invitations may still be accepted in the latter case. CANCELLED stops sends and revokes pending invitations. Appointment start/unavailability cancels remaining work. A new sequence can be explicitly authorized after cancellation/exhaustion when no pending invitation remains, retaining old history and the slot's last actual-send interval.

Staff see state, capacity, last group, actual history, responses, next time/countdown, pauses/skips and close-to-start warnings. Sequence routes enforce current clinic membership inside the scheduling transaction; POST enforces same-origin CSRF checks. Draft/preview contains only scheduling-relevant synthetic names and exclusion summaries, not other clinic histories. Role selection is not authorization. The worker has no public endpoint or browser-controlled clock/interval.

## Persistence and integrity

NotificationSequence stores author, reason, state, firstGroup, lastSentAt and nextSendAt. NotificationGroup stores one P1–P4 snapshot per sequence, exact request fingerprint/priority version, status, note and actual sentAt. Offer.groupId distinguishes competitive offers from legacy exclusive holds. Notification is the real durable inbox. Database clock is sampled after acquiring the PostgreSQL transaction advisory lock. A group's offers + notifications + send time + next job commit atomically, so failed sends leave no partial batch and retries produce no duplicates. Multiple workers share lock 728194 with all scheduling writers; partial indexes preserve one confirmed booking, one live sequence and exclusive legacy offers. SQL trigger rejects a forged group/slot link or legacy/group invitation mixing.

Direct booking is denied while active/scheduled/paused workflow or pending competitive invitations exist. Legacy approve is denied for a group-managed opening. Group decline/expiry does not release another patient's hold. Expiry/acceptance are server-checked without relying on the worker; the worker is required for prompt delivery, not booking integrity. Global locking deliberately trades throughput for reviewable correctness in this small synthetic prototype; high-volume job partitioning/outbox adapters are not implemented.

Group expiry = min(actual send + 12 hours, appointment start); legacy expiry remains 10 minutes. Interval is fixed at 180 minutes, never configurable through UI/API/demo mode. Close-to-start warnings appear when less than 190 minutes remain. No external delivery adapter is used: email/SMS/push and institution/insurer/referral verification are not real integrations.

## Migrations and rollout boundary

- 0006 adds sequences/groups, groupId, slot requirement flags and clinic/request clearance flags, preserves all old rows and pending exclusive offers, scopes the old pending-offer uniqueness to legacy offers, and adds group invitation integrity checks.
- 0007 retains historical sequences for repeated openings, replacing per-slot lifetime uniqueness with one live-sequence partial index. Existing 0001–0005 bytes are unchanged; no old teammate migration was copied.
- Old batch branch 51fcedc was selectively inspected (service/worker/0003 SQL). Its two groups, configurable 1–60 minute interval, pending-response gate and HELD semantics are incompatible and were not imported.
- Migrations were exercised only on a new isolated PostgreSQL 17 container, careousel-phase7-tests, port 5547, careousel_test. Never run db:seed, reset or test preparation against shared data.
- After review, obtain separate authorization for the intended shared target, back up/preflight, stop old workers, apply checksum-tracked `npm run db:migrate`, generate the matching client and start the reviewed app/worker under supervision. Roll back application traffic by disabling group starts/worker while preserving migrations/history; old code that assumes one pending offer is unsafe against active competitive invitations. Do not drop tables or reverse applied migrations as a shortcut.

## Synthetic demonstration without three real hours

Run `npm run test:integration` and `npm run test:e2e` with an explicitly isolated TEST_DATABASE_URL named careousel_test, different from DATABASE_URL. `tests/helpers/notification-scenario.ts` is guarded test-only setup: cancelled Cedar opening, four reviewed groups with protected original appointments at Harbor/Summit/Willow/Cedar, and no internal preference. It is never called by normal startup or a public API.

The Phase 7 browser test checks staff preview/recipient selection/authorization, P1 inbox, a worker advancing P2 using injected isolated test time, patient acceptance, future-group termination, original preservation and mobile bounds. No production scheduling rule is shortened. The persistence script stops the production server, seeds only the isolated database with controlled past P1 time, runs a **fresh independent worker process while the web server is stopped**, restarts production and verifies overdue P2/history/next send. No browser is involved in that recovery.

Follow VALIDATION.md for actual test results; tests do not establish production security, healthcare compliance or clinical correctness. Advanced service variants, referral-document review and a complete independent-care-need model remain later work. No impact dashboard was started.
