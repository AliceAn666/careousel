# Phase 8 Part A: clinician-authored medical tags

This implementation starts at CI-verified main `3f36058` after PR16/PR17. It implements persisted clinical tags, not record import, diagnosis, automated triage or a new matching engine. No hospital or external AI connection exists. Clinical credential verification is simulated; account authentication, clinic authorization, persistence and review are functional.

## Working flows

1. An authenticated clinic administrator opens **Clinic staff access**, grants **clinical author permission** to an active individual membership, and records the reason. STAFF or ADMIN alone does not grant this permission; old memberships default to false. Revocation is immediate. Membership revocation and re-enrollment clear clinical permission. Permission decisions are audited. The administrator must validate real credentials outside this synthetic prototype.
2. A permitted clinician opens **Medical tags**, selects an existing same-clinic confirmed visit whose start has passed, and records a medical need and draft tag during or after the visit. No patient-ID directory or arbitrary patient picker is exposed. Future, cancelled and replaced (RESCHEDULED) bookings cannot originate tags; a replaced booking is not evidence that its original visit occurred. Visit attendance itself is clinician-attested in this prototype, not verified by a hospital encounter feed. In explicit Demo Mode only, `staff-cedar` is an allowlisted synthetic clinician; other synthetic staff are not authors. No new seed visit is added on application startup.
3. The tag supports follow-up recommendations, private clinical notes, optional recommended UTC timeframe, service requirements, and clinician/clinic/visit attribution. Subsequent tags can reference an existing same-patient, same-clinic, same-service clinical need. Leave the need ID blank for a new independent clinical context. Existing needs are shown with their IDs in the clinical view.
4. Explicit **Approve medical tag** records clinician review. The author may also be the reviewer; this release does not impose a second-clinician policy. Edits return the current tag to DRAFT and require review again. Retire superseded tags instead of deleting them. Versioned snapshots retain previous approved content, author, reviewer, reasons and timestamps. The clinician can inspect snapshots in audit history.
5. Patients open **Health information** to read only their own currently approved tags, source and follow-up information. Retired/draft tags and internal revision reasons are not exposed to patients. Existing self-report answers remain unchanged and clearly distinguished. Search, basic-service booking and waitlists remain accessible without questionnaires or tag review.
6. Same-clinic scheduling staff see only approved scheduling evidence, without private clinical notes, drafts or revision snapshots. Priority review cards show approved evidence matching the patient and service. Staff must confirm relevance to the individual request and separately approve P1–P4, referral clearance and authorization clearance. Tags do not automatically satisfy those checks, change bookings, create offers, start sequences or change the three-hour cadence. Evidence is not shared across clinics.

## Data and transaction boundaries

Migration `0008_clinician_medical_tags` is additive. `MedicalNeed` holds the clinical context and original visit; `MedicalTag` holds the current reviewed or draft version; `MedicalTagRevision` retains immutable snapshots. Legacy `Intake`/`SymptomTag` records are not clinical tags and are neither copied nor scored. Existing migrations 0001–0007 remain byte-for-byte unchanged.

The SQL migration explicitly enforces patient/booking foreign keys, need/patient/clinic composite identity, source-clinic consistency, valid states/kinds/timeframes, approved-review metadata, immutable tag provenance, monotonic versions and append-only revision history. Some SQL-only foreign keys/triggers are intentionally maintained in the migration; do not generate a schema replacement that drops these safeguards. The existing explicitly confirmed synthetic reset/test-fixture transaction may delete histories using transaction-local `careousel.synthetic_reset`; ordinary UI/API/startup never sets this flag. This is protection from accidental SQL writes, not a substitute for a restricted database administrator role.

Every service operation uses the existing global PostgreSQL advisory lock `728194`; role/membership/clinical grant checks and tag, revision and generic audit writes share one transaction. Version conflicts return 409 and require refresh; the UI retains the draft on failure. Retrying an edit/review with the same old version cannot create another revision. Creation is not idempotent across separate submissions; UI disables submission while pending. If a create response is lost, refresh the clinical list before creating again. Clinical notes stay out of generic state, audit action strings, recommendations and external services.

## API contract

`GET /api/medical-tags` requires a session and returns `canAuthor`, scoped `tags`, source `encounters` available to authors, and scoped author/clinic/patient display names. Responses use `Cache-Control: no-store`. Patients receive no encounters or other patients. Nonclinical staff receive approved scheduling projections only; they do not receive `clinicalNotes` or `revisions`. Full tags and histories are available only to authorized same-clinic clinicians. No medical data is returned anonymously.

`POST /api/medical-tags` requires a valid same-origin request and clinical author permission. Strict Zod validation rejects client-controlled patient, clinic, source type, author, state, urgency and priority fields. Dates are nullable ISO timestamps. JSON shapes:

```ts
// Shared editable fields
{
  kind: 'FOLLOW_UP' | 'SERVICE_REQUIREMENT' | 'CLINICAL_NOTE',
  label: string, // 3–160 chars
  clinicalNotes: string, // up to 4000 chars
  followUpRecommendation: string, // up to 4000 chars
  recommendedFrom: string | null,
  recommendedBy: string | null, // >= from when both supplied
  requiresReferral: boolean,
  requiresAuthorization: boolean,
  reason: string // 3–500 chars
}
// Create: shared fields + { type: 'create', sourceBookingId, needTitle, needId? }
// Edit: shared fields + { type: 'edit', tagId, expectedVersion }
// Review: { type: 'approve' | 'retire', tagId, expectedVersion, reason }
// Success: { message, tagId, version }
```

`POST /api/clinic/access` adds administrator-only `{type:'clinicalPermission', membershipId, enabled, expectedEnabled, reason}`. The member must be active in the administrator’s clinic. A stale permission decision returns 409; unauthorized requests return 403. No HTTP bootstrap or self-service clinician enrollment exists.

## Explicit boundaries for follow-up PRs

- PR2: patient-authorized **synthetic** FHIR-compatible record import, searchable source text, local deterministic extraction and clinician accept/correct/reject review. No real hospital connectivity or external AI transmission by default. Not implemented here.
- PR3: external appointment references, explicit links between multiple independent medical needs/requests/bookings, and advanced service eligibility. Part A clinical needs do not alter the existing one-active-request-per-patient/service constraint or cross-service booking/offer behavior. Do not claim complete independent scheduling until PR3 changes and regressions are delivered.
- Neon initialization, Vercel/Cloudflare configuration, cloud deployment and shared database migration remain separate, explicitly authorized work. No deployment is performed by this PR.

## Verification

Checks run only against a newly created isolated PostgreSQL 17 container on local port 5549, database `careousel_test`. The application database URL during checks points to an unused sentinel, and test guards redirect explicitly to TEST_DATABASE_URL. No existing Codespaces/cloud/demo database was read, migrated, reset or reseeded.

Actual final results (October 17, 2026):

| Check | Result |
| --- | --- |
| Lint | Pass, zero errors; one inherited anonymous-export warning in deployment/cloudflare/worker.js |
| Typecheck | Pass |
| Production build | Pass, Next.js webpack build |
| Unit tests | 51 passed across 10 files |
| PostgreSQL integration tests | 78 passed across 9 files |
| Chromium E2E | 23 passed, including new clinical/patient/admin journeys and existing regressions |
| Production restart / worker rehearsal | Pass: medical tags/needs/revisions, sessions, booking and priority history persisted; restarted independent worker sent overdue P2 with web server stopped |
| Format / diff checks | Pass |

Coverage includes same-clinic and cross-patient privacy, explicit permission grant/revoke, source eligibility, concurrent reviews/version conflicts, immutable history/provenance, edit-to-draft, rollback when revision persistence fails, migration preservation of populated account/intake/legacy tags/booking/waitlist/priority/history/sequence rows, scheduling evidence, browser clinical/patient/admin flows and the existing scheduling regressions. The existing pg driver emits a deprecation warning about concurrent queries on one client; it does not fail these checks. The internal notification route received formatting only to repair an inherited format-check failure; no cron or deployment behavior changed.

Integration follow-up: main advanced during development to `3a827a6` (PR18–PR20). Merged its existing safe-error diagnostics and Prisma WASM tracing configuration without conflict; no deployment was performed. Final checks were repeated on the combined branch. Formatting-only cleanup also covers the inherited HTTP diagnostics formatting.

## Part B extension

Patient-authorized synthetic imports, local extraction and clinical review are now implemented in the Part B branch; see [record contracts and privacy](medical-record-import.md). Migrations 0009–0010 add a second, immutable source type SYNTHETIC_RECORD_REVIEW without fabricating visits. Approved imports integrate with the existing clinical tag UI and priority evidence; active consent is required for clinic access/use. Earlier Part A verification/scope notes above describe that original PR, not the current Part B implementation.
