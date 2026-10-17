# Independent patient scheduling needs (Phase 8 Part C)

Implemented from PR #25's merged main `fba373e`; its latest main CI was successful before branching. During development, main advanced to PR #26 (`ee7e402`); [CI 39025855934](https://github.com/AliceAn666/careousel/actions/runs/39025855934) succeeded and that main was merged into this feature branch, preserving its readable typography. No deployment or shared database was accessed. Migration **0011_independent_patient_needs** is additive. Applying it outside isolated development/test requires separate authorization.

## Patient journey

Open **Manage My Appointments and Waitlists** (`/needs`). Add an independent need with a title and service. Symptoms and record imports are never required. Search preferences and optional requirements/evidence are collapsed into an optional section. Choose no original appointment, an unassigned confirmed Careousel booking, or an external booking. Several needs may use the same service.

External reports collect clinic, service (from the need), UTC start and duration, location, optional reference and patient-reported confirmation. Every report remains **PATIENT_REPORTED_UNVERIFIED**, including a patient-reported cancellation. Careousel cannot verify, modify or cancel the hospital appointment. After securing replacement care, the UI explicitly asks the patient to contact the external clinic. Corrections require a reason, preserve before/after audit snapshots and withdraw only that need's requests for fresh review.

Each need has independent preferences, linked approved tags, original/current appointment, requests, history and state. Browse appointments or join its shared waitlist. Potential insurance incompatibilities and referral/authorization requirements are visible warnings; actual booking/acceptance still enforces saved-plan compatibility, requirements and staff clearance. Patient requirement flags add requirements and never grant clearance. Service eligibility is based on the platform's configured service strings and clinic slot requirements, not real payer verification.

Completing or closing a need withdraws its own active requests and revokes its own invitations. All confirmed appointments remain. Reopening permits a fresh request. Booking cancellation remains a distinct action. A secured need may search again using its current confirmed Careousel booking as the source; the historical external report remains unchanged.

## Model and invariants

`PatientNeed` is a patient-owned **scheduling context**, separate from Part A's source/clinic-bound clinical `MedicalNeed`. `MedicalNeed` and existing tags are preserved without conversion or backfill. States are OPEN, SECURED, COMPLETED, CLOSED. New `Booking.needId` and `Waitlist.needId` are nullable for legacy compatibility.

- Original internal or external source is immutable and belongs to exactly one need; never both. Internal bookings are assigned only if confirmed, owned, same-service and free of an active legacy replacement request.
- A partial unique index permits one ACTIVE request per need. Legacy unbound requests retain one ACTIVE request per patient/service. Additional indexes prevent multiple active replacements of the same internal/external source.
- Composite foreign keys enforce patient ownership on source/current bookings, external reports and linked evidence. SQL triggers guard service/source identity and version progression. All mutations run inside the scheduling advisory lock transaction.
- Successful replacement creates the new booking before rescheduling the linked internal original. Failure rolls back everything. The external report is never cancelled. Competing acceptances cannot produce two winners; conflicting appointments across all other needs are checked, including confirmed external reports.
- One winner stops that need's requests only. Other needs' pending invitations remain unless the underlying slot is won by somebody else, expires, or another existing slot-level rule invalidates them. Their requests stay active. Acceptance rechecks conflicts; an invitation is not a guaranteed seat.
- `PatientNeedHistory` is append-only, uniquely versioned and includes actor/action/timestamp/snapshots. External corrections include before/after. Application operations never delete needs, reports or history. Existing synthetic reset code is retained solely for explicit guarded test/Demo Mode fixtures; this development used only a fresh isolated test database.
- Exact external deduplication uses normalized clinic/reference when present, otherwise clinic/service/start/location. It cannot detect inaccurate reports or semantically identical clinics named differently.

## API contracts

`GET /api/patient-needs`: authenticated patient only, own needs/history/requests/bookings, own approved usable tags, public clinics/openings and saved plan. `Cache-Control: no-store`. Clinic staff cannot use this patient management endpoint; they receive minimal request-specific evidence through their existing authorized priority view.

`POST /api/patient-needs` (also supported by `/api/actions`) uses strict Zod actions from `src/lib/patient-needs.ts`:

| Action | Inputs |
| --- | --- |
| `createNeed` | title, configured service, preferences, requiresReferral, requiresAuthorization, tagIds, original `{type:NONE}` / `{type:INTERNAL,bookingId}` / `{type:EXTERNAL,appointment}` |
| `editNeed` | needId, expectedVersion, title, preferences, requirement flags, tagIds; service/source cannot change |
| `requestNeed` / `completeNeed` / `closeNeed` / `reopenNeed` | needId, expectedVersion |
| `editExternal` | needId, expectedVersion, appointment report, reportedCancelled, reason |

Preferences contain plan (must equal saved plan), city, clinicIds, maxPrice (integer cents), earliest/latest timestamps, clinic-local startHour/endHour and weekdays (0–6). External appointment contains clinicName, start/end timestamps, location, reference (empty allowed), reportedConfirmed boolean. Browser forms explicitly label UTC appointment/search timestamps. No arbitrary patient ID, verification or priority field is accepted.

`POST /api/actions {type:"book",slotId,needId,expectedNeedVersion}` books/replaces only that need. Offer response derives its need from persisted waitlist linkage, never a browser-selected context. Withdrawal/cancellation reuse existing authorized actions. Stale versions fail and require refresh. Patient/staff ownership and same-origin checks remain enforced.

## Clinical evidence and staff authority

Patients can explicitly link own currently approved same-service clinician tags, including reviewed synthetic imports with active consent. Clinic priority views include only that clinic's approved evidence explicitly linked to this need; unrelated same-service needs do not automatically inherit it. Raw notes/drafts are not exposed. Revoked imports immediately stop supplying evidence. Clinical tags do not set P1–P4, approve referrals/authorization, start notifications or book care. Human review and the existing staff-authorized three-hour group cadence remain unchanged.

## Verification and limits

Tests cover independent same-service requests, external ownership/deduplication, rollback, original preservation, competing and group acceptance, evidence privacy, requirement/insurance enforcement, immutable history, migration preservation, real Chromium journeys and production restart persistence. See `VALIDATION.md` for executed counts/results.

No real hospital, insurer, referral-validation, external cancellation or deployment integration is claimed. External records are patient reports; test data is synthetic. Notifications remain the existing durable inbox/worker workflow. Automatic external cancellation would require an explicitly authorized real integration, separate design and tests.
