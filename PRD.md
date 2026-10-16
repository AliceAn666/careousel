# Careousel Product Requirements

Status: Proposed; awaiting team approval before implementation.

## 1. Purpose and success

Careousel is a cross-clinic appointment search, booking, and intelligent waitlist platform. Patients find suitable care across participating clinics; staff fill cancellations with eligible patients while retaining control over scheduling and clinical urgency.

The target is a polished, functional Level-2 hackathon prototype: real server-side behavior, persistent relational data, validated state transitions, and a repeatable demonstration. It is not a production healthcare system. All identities, insurance plans, records, and transactions are synthetic.

Success means a presenter can complete the cancellation-to-earlier-booking workflow in under five minutes, repeat it after an explicit demo reset, and refresh or restart the application without losing committed changes. Two competing booking requests must never both succeed. No external service is required during the core demonstration.

## 2. Repository findings and proposed architecture

Inspection on 2026-10-16: repository root is `/workspace/careousel`; only `README.md` exists outside Git metadata; working tree was clean. There is no application, package manifest, test setup, or existing architecture to preserve.

Proposed stack, subject to approval:

| Area | Choice | Reason |
| --- | --- | --- |
| Application | Next.js App Router, React, strict TypeScript, Node.js LTS | One repository and language for UI and server; familiar Codex workflows |
| UI | Tailwind CSS, shadcn/ui with accessible primitives, Lucide icons | Consistent professional components and rapid iteration |
| Persistence | PostgreSQL with Prisma migrations and client | Transactions, relational constraints, explicit migration history |
| Validation | Zod at server boundaries | Shared input contracts with authoritative server validation |
| Tests | Vitest for domain and database integration; Playwright for browser journeys | Test rules, concurrency, and the actual demo |
| Tooling | npm with committed lockfile, ESLint, TypeScript checks, GitHub Actions | Reproducible setup and shared PR checks |
| Notifications | Persistent in-app inbox with short polling | Reliable without email/SMS credentials |
| Matching | Deterministic rules and transparent ranking | Explainable, testable, no model dependency or clinical inference |

Use one deployable application and one PostgreSQL database. Server route handlers invoke domain services; services own authorization, transactions, matching, and state changes. React components do not write to the database directly. Proposed structure: `src/app`, `src/components`, `src/lib`, `src/server/services`, `src/server/auth`, `prisma`, `tests`. Run a supported local PostgreSQL instance for the offline fallback; select hosting later. Pin mutually compatible stable versions during approved implementation; do not install anything in this planning phase.

Evaluate package licenses before adoption, prefer MIT/Apache-2.0/BSD-compatible dependencies, retain required notices, and avoid copying unlicensed code or assets.

## 3. Scope and priorities

### P0 — required demo

- Server-validated demo sessions for seeded patients and clinic staff, with role and clinic isolation.
- Search across clinics by specialty/service, location, accepted insurance, estimated cost, and available date/time.
- Clinic and slot details, direct booking, booking list, and cancellation.
- Waitlist entry with or without an existing booking, editable preferences, withdrawal.
- Cancellation releases capacity and automatically computes eligible candidates.
- Staff review of candidates and explicit approval of one time-limited patient offer.
- Persistent patient notification, accept/decline, expiration handling, and atomic confirmation or rescheduling.
- Persistent synthetic fixtures, explicit guarded demo reset, audit history, responsive accessible UI, error and empty states.
- Integration and browser tests covering the main journey and double-booking protection.

### P1 — after P0 works

- Additional visual schedule views, aggregate utilization and days-saved metrics.
- More detailed match explanations and staff filters.
- Additional appointment types and richer insurance/payment simulation screens.

### P2 — stretch, not required

- Real email/SMS adapters, maps, calendar export, realtime push, production identity provider.

Out of scope: real clinical data, EHR integrations, real insurance verification or payments, diagnosis, autonomous triage, medical advice, complex recurring schedules, and production compliance certification. No LLM or paid API is necessary for P0.

## 4. Roles and stories

| Role | Story | Observable result |
| --- | --- | --- |
| Patient | Find clinics accepting my plan within my budget and preferred dates | Combined filters produce matching slots with clear estimates |
| Patient | Book a slot and view my appointment | One confirmed booking persists after refresh |
| Patient | Keep my existing booking while seeking an earlier slot | Joining a waitlist leaves the original booking confirmed |
| Patient | Receive and respond to an approved offer | Inbox shows expiry, clinic, time, and consequences of acceptance |
| Patient | Decline or miss an offer without losing my appointment | Original booking remains; waitlist stays active |
| Staff | Cancel a booking and release the slot | Schedule updates and candidates appear |
| Staff | Understand and approve an eligible candidate | Eligibility reasons are visible; approval creates a reserved offer |
| Staff | Manage my clinic's schedules and waitlists | Other clinics' patient details and mutations are inaccessible |
| Presenter | Repeat a reliable synthetic scenario | Explicit reset restores a documented baseline |

## 5. Pages and behavior

All pages show Careousel branding and a visible synthetic-demo notice. Insurance acceptance and cost labels state that they are simulated and estimates respectively. Payment simulation, if shown, never requests real card details.

| Page / proposed route | Content and actions |
| --- | --- |
| Demo entry `/` | Product explanation, synthetic patient/staff persona selection, session entry |
| Search `/search` | Specialty, city/area, plan, maximum cost, date range; clinic/slot cards; clear filters; loading, empty and failure states |
| Clinic `/clinics/[id]` | Address, services, accepted demo plans, accessibility information, estimated prices, available slots |
| Booking review `/appointments/new` | Selected slot, estimate, demo insurance status, final confirmation with conflict recovery |
| My appointments `/appointments` | Confirmed/cancelled bookings, details, cancellation confirmation, join-earlier-waitlist entry point |
| My waitlists `/waitlists` | Preferences, linked booking, status, edit and withdraw |
| Inbox `/notifications` | Persistent unread/read notifications and offer details; accept/decline only when actionable |
| Clinic schedule `/clinic/schedule` | Date-filtered schedule, bookings and availability, release/create future slots, cancellations |
| Clinic waitlists `/clinic/waitlists` | Clinic-relevant eligible requests, released slots, ranked candidates, reasons, approve/reject for this slot |
| Clinic activity `/clinic/activity` | Booking, cancellation, approval and acceptance audit trail within clinic scope |
| Demo tools `/demo` | Staff/demo-administrator-only reset confirmation and scenario guide; hidden/disabled outside demo mode |

Clinic staff must not see unrestricted cross-clinic histories. Candidate views disclose only synthetic identity, relevant preferences, eligibility and scheduling details. Date/time displays include the clinic timezone. Desktop dashboards and mobile patient flows must remain usable at 375px width. Inputs need labels, keyboard focus, inline validation, adequate contrast, and non-color-only statuses.

## 6. Matching and scheduling policy

### Hard eligibility filters

A candidate must have an active waitlist request; match the service and visit type; permit the clinic and location; accept the offered date, weekday and time window; meet maximum cost; and match an accepted synthetic insurance plan (or explicitly allow self-pay). No unknown compatibility is silently accepted. Any simulated referral/age restrictions, if introduced, must be explicit and validated, otherwise exclude those service types from P0.

The slot must be future, available, and compatible in duration/provider capability. A replacement must start strictly earlier than the linked confirmed appointment. A patient cannot overlap another confirmed booking, except the booking being replaced. Use half-open intervals `[start, end)` so adjacent appointments are allowed. Travel buffers are deferred and disclosed.

### Ranking and human control

Rank eligible patients by waitlist creation time, then stable request ID. Show reasons such as “plan accepted,” “within preferred hours,” and “14 days earlier.” This is intelligent eligibility matching, not a clinical urgency score. Do not infer urgency from age, diagnosis, free text, insurance, or cost. Qualified clinic staff handle clinical urgency outside automated ranking; staff may choose any eligible candidate and record a reason. Never bypass hard constraints.

Cancellation triggers candidate generation automatically, but a candidate match is only a suggestion. Staff approval creates one offer and one exclusive slot hold. Only the approved patient receives an actionable offer notification. Staff activity can show a separate match-ready notice before approval. This ordering avoids promising an appointment before clinic review.

Proposed offer lifetime: 10 minutes, configured centrally; seeded rehearsal includes an expiry scenario. Decline/expiry releases the hold and returns the slot for staff review of the next candidate; no automatic broadcast or automatic appointment confirmation. Reads and every relevant mutation enforce expiry using server time, so correctness does not require a background worker or an open browser.

## 7. Data and state model

Proposed entities: User, PatientProfile, Clinic, StaffMembership, Service, ClinicService (including price/duration/accepted plans), InsurancePlan, Slot, Booking, WaitlistRequest, MatchSuggestion, Offer, Notification, AuditEvent. Use stable IDs, foreign keys, creation/update timestamps, UTC timestamps, explicit clinic IANA timezone, and integer money amounts in cents with currency.

- Slot: `AVAILABLE -> HELD -> BOOKED`; decline/expiry returns `HELD -> AVAILABLE`; cancellation returns `BOOKED -> AVAILABLE`. A clinic may withdraw an unbooked slot; held slots require explicit offer revocation first.
- Booking: `CONFIRMED -> CANCELLED` or `RESCHEDULED`. A new linked booking records the replacement; never erase historical bookings.
- Waitlist: `ACTIVE -> FULFILLED` or `WITHDRAWN`. A pending offer does not fulfill it. Proposed P0 allows one active request per patient/service, with at most one linked confirmed booking.
- Offer: `PENDING -> ACCEPTED | DECLINED | EXPIRED | REVOKED`; terminal states cannot be reused.
- Suggestions are revalidated at approval; they do not reserve capacity.

### Integrity requirements

Use database constraints for one confirmed booking per slot and one pending hold per slot, plus transactional row locking and consistent lock ordering for mutations. Serialize booking changes per patient as well as per slot to prevent overlapping appointments across different slots. Implement the exact Prisma/SQL constraints in the first schema milestone and verify them on PostgreSQL, not an in-memory substitute.

Accepting an offer is one transaction: authenticate patient; lock relevant patient/slots/bookings/request/offer; expire stale holds; recheck eligibility and version/state; create the new booking; mark the old booking rescheduled if linked; fulfill the request; accept the offer; invalidate incompatible pending offers; persist notifications and audit. Any failure rolls everything back and preserves the original appointment. Release the original slot and compute its candidate suggestions in the same committed operation; newly generated suggestions still require approval before offers.

Direct booking, cancellation, approval and acceptance must tolerate double clicks/retries through unique operation keys or equivalent idempotent state checks. Concurrency conflicts return a helpful conflict response, never silent success. A changed preference or cancelled original booking revokes an incompatible pending offer; withdrawing a request revokes its offers. Revalidation occurs at approval and acceptance. If matching fails, cancellation remains safely committed and staff can retry suggestion generation without duplicate notifications.

## 8. End-to-end workflows

### A. Search and book

Patient selects a seeded identity, filters across clinics, opens details, reviews a slot and simulated price/insurance, and confirms. Server checks access and availability and commits booking/audit. UI shows the confirmed appointment after refresh. A concurrent loser receives a conflict and refreshed alternatives.

### B. Main demonstration: earlier appointment across clinics

1. Seed patient Avery has a dermatology booking at Harbor Clinic in about 28 days; an earlier matching slot at Cedar Clinic in about 7 days is booked by another synthetic patient.
2. Avery joins a cross-clinic dermatology waitlist, selects accepted plan, budget and preferred hours; the original booking stays confirmed.
3. Cedar staff cancels the earlier slot's existing booking. Capacity is released; eligible candidates appear with explanations and ineligible fixture candidates are excluded.
4. Cedar staff reviews candidates and approves Avery. The slot is held, and a persistent in-app offer notification is generated.
5. Avery opens the inbox and accepts before expiry. One transaction confirms Cedar, marks Harbor booking rescheduled, fulfills the waitlist and releases Harbor's slot.
6. Both clinic schedules, Avery's appointment list and audit history reflect the change after refresh. Harbor can review its own new candidates without receiving Cedar's unrelated patient data.

Use relative dates computed during explicit seed/reset, with stable fixture IDs and injected test clocks. Never regenerate the database on ordinary startup.

### C. Decline, expiry and conflicts

Decline or expiry preserves Avery's Harbor booking and active waitlist, releases Cedar's slot, and exposes the next candidate for human review. An old offer URL cannot confirm a reassigned slot. Cancelling an already-cancelled booking is idempotent. No-match cancellations leave a visibly available slot for direct booking. Competing staff approvals and competing patient actions yield only one valid result.

## 9. Synthetic dataset and demo operations

Seed at least 4 clinics, 3 specialties, 4 demo plans plus self-pay, 12 patients, 4 staff identities, and 40 slots across upcoming weeks, with bookings and active waitlist requests. Include compatible and incompatible plan, budget, location, service and time cases, one overlapping appointment, a tie in ranking, a no-match slot, and pending/expired offer examples. All data is invented, including contact addresses using reserved example domains.

Demo sessions use a server-issued signed, HTTP-only cookie tied to an allowlisted seeded persona. Every mutation enforces role, patient ownership or clinic membership on the server. A client role selector is not authorization. Persona switching is explicitly labeled demo access and disabled outside demo mode; production identity is deferred. Protect cookie-based mutations from CSRF with same-origin enforcement and appropriate cookie settings.

Database changes survive browser refresh and application restart. Reset is an explicit demo-only privileged action with confirmation, transactional reseeding, and no production availability. Provide a documented local run path, migration/seed commands and manual walkthrough during implementation. No real credentials, insurance identifiers, payment details or medical records may be entered or logged.

## 10. Acceptance criteria

| ID | Priority | Given / when / then |
| --- | --- | --- |
| AC01 | P0 | Combined specialty, location, insurance, price and date filters return only compatible seeded availability; clearing filters restores results |
| AC02 | P0 | Two patients simultaneously book one available slot; exactly one confirmed booking exists and the loser sees a conflict |
| AC03 | P0 | A patient joins an earlier waitlist; linked appointment stays confirmed and preferences persist after refresh |
| AC04 | P0 | Staff cancels a booking; slot becomes available and matching excludes each incompatible fixture with deterministic eligible ordering |
| AC05 | P0 | Staff approves a candidate; one hold and one actionable notification are persisted; no new booking exists yet |
| AC06 | P0 | Patient accepts valid offer; new booking, old reschedule, waitlist fulfillment, slot changes and audit commit atomically |
| AC07 | P0 | Decline, expiry or failed acceptance leaves original booking intact; hold is released and next candidate can be reviewed |
| AC08 | P0 | Repeat requests, two approvals and stale offers cannot create duplicate bookings, holds or notifications |
| AC09 | P0 | A patient or staff member calls another identity/clinic's endpoint directly; server denies read/mutation without leaking records |
| AC10 | P0 | Restart the app against the same database; previous booking and inbox changes remain visible |
| AC11 | P0 | Confirm demo reset; baseline returns with future relative dates; ordinary startup and non-demo mode cannot reset data |
| AC12 | P0 | Complete workflow B through browser UI without database edits or external APIs; keyboard and mobile patient flow remain usable |
| AC13 | P0 | Simultaneous attempts book overlapping slots for one patient; at most one commits; adjacent slots remain allowed |
| AC14 | P0 | Preference change, withdrawal or original-booking cancellation invalidates affected pending offers; stale acceptance safely fails |
| AC15 | P0 | Inject failure during replacement; rollback leaves original booking confirmed and no partial new booking |

## 11. Risks and controls

| Risk | Control / scope decision |
| --- | --- |
| Overbuilding under deadline | Deliver one tested vertical slice first; cut P2 and P1 before P0 integrity |
| Race conditions and partial reschedules | PostgreSQL transactions, constraints, patient/slot locks and concurrency tests |
| Fragmented contributions | Shared contracts and schema owner, small PRs, protected main, CI |
| Unreliable live services | Persistent inbox, deterministic matching, local app/database rehearsal |
| Timezone and seed drift | UTC storage, clinic timezone display, relative seed dates, test clock |
| Misleading healthcare claims | Synthetic labels, explainable administrative rules, explicit human approval |
| Schema/hosting incompatibility | PostgreSQL from first integration; hosting chosen before deployment work |
| Public demo misuse | Server authorization, demo-mode gates, synthetic-only data; production readiness out of scope |

## 12. Assumptions and unresolved decisions

These are proposed defaults, not approved implementation choices.

| ID | Topic | Proposed default / unresolved input |
| --- | --- | --- |
| D01 | Stack | Next.js + PostgreSQL + Prisma as above; confirm team familiarity |
| D02 | Deadline | Hackathon duration unknown; use dependency-based milestones rather than promised dates |
| D03 | Hosting | Unresolved provider, budget and credentials; require durable PostgreSQL and local fallback; deployment needs later authorization |
| D04 | Demo access | Seeded signed-cookie personas; production authentication excluded |
| D05 | Geographic scope | One US metro, USD, city/area filtering, clinic timezone America/Los_Angeles; no geocoding needed |
| D06 | Offer policy | One exclusive offer per slot, ten-minute lifetime, clinic approval before patient notification |
| D07 | Ranking | FIFO among eligible patients; no automated clinical urgency ranking |
| D08 | Waitlist policy | One active request per patient/service; decline/expiry keeps request active; cross-clinic replacement explicitly consented to |
| D09 | Eligibility | Structured service, time, location, budget and demo insurance; specialized clinical eligibility excluded from fixture services |
| D10 | Staffing | Five suggested owners in TASKS.md; actual names and strengths unresolved |

Approval of planning should resolve or accept the proposed defaults; implementation must not begin before the user's approval.
