# Phase 8 Part B: patient-authorized synthetic records

Base: PR21 merged, main `429cee08a665af276a0e1153a4779a57b43310fd`, [CI 39022984937](https://github.com/AliceAn666/careousel/actions/runs/39022984937) **success** before creating `feat/phase8-synthetic-record-import`. No Vercel, Neon, Cloudflare or deployment setup is part of this change. Part C remains gated on Part B review and merge.

## Functional demonstration

1. Log in as a patient, including a newly registered account with no appointments, self-report or clinical tags. Open **Manage My Appointments and Waitlists → View saved health information** (`/health-information`). Booking and waitlists do not require this workflow.
2. Under **Patient-authorized synthetic medical records**, choose one clinic and explicitly check the consent statement. **Authorize and import synthetic records** atomically stores clinic-specific consent and four server-generated FHIR-compatible sample resources. There is no preselected consent, patient-ID input, arbitrary source URL, upload, real hospital connection or import of existing demo patient history.
3. Inspect the sample Condition and three ServiceRequests. They demonstrate historical eczema information, Dermatology follow-up in 14–28 days, a Blood test in 7–14 days, and Cardiology follow-up in 30–60 days with referral/prior-authorization examples. These are samples, **not diagnoses for the account holder**. Resource JSON, exact text and SHA-256 source hashes are available to the patient and explicitly permitted clinicians.
4. Search with **PostgreSQL full-text** (English stemming/web-search syntax) or **Literal keyword** (case-insensitive substring). Search is parameterized and scoped before returning records. Diagnosis text is searchable but does not, on its own, generate appointment recommendations.
5. **Extract local suggestions** identifies explicit follow-up instructions, canonical services, referral/authorization wording and FHIR occurrencePeriod timeframes. Negated follow-up/referral instructions are handled conservatively. Suggestions remain **UNCONFIRMED**. They do not enter MedicalTag, priority evidence or automated matching decisions.
6. Optional **Try optional local AI with fallback** uses the same synthetic evidence. Without an explicitly configured local model, it reliably returns deterministic results and states that fallback was used. Existing reviewed suggestions are never overwritten, resurrected or duplicated by re-extraction.
7. An active clinic member with the separate Part A clinical author grant opens **Record review** (`/clinic/medical-records`). Only that clinic's actively consented records are visible. The reviewer can correct fields and save a pending suggestion, explicitly approve it, or reject it, with an audit reason and optimistic version check. Patient and ordinary STAFF/ADMIN accounts cannot perform clinical review. Clinical credential verification remains simulated, as in Part A.
8. Approval creates an APPROVED Part A MedicalTag and MedicalNeed, with immutable source import/resource/excerpt, clinician, clinic, review time and revision history. No prior visit is fabricated for a new patient. Subsequent clinical edits use **Medical tags** and return the tag to draft, requiring review again. Patients see their own currently approved tags. Scheduling staff receive only approved scheduling fields, never raw source records, private clinical notes or revision snapshots.
9. Priority review shows same-patient/service/clinic approved evidence. Authorized staff separately approve P1–P4 and referral/authorization clearance. Imported tags do not verify documents, assign urgency, infer a diagnosis, start a notification sequence, change its interval or change a booking.
10. The patient can explicitly **Revoke record consent**. In one scheduling-locked transaction all tags from that import are retired, revision history is appended and consent becomes REVOKED. Clinic record/search/audit/suggestion access immediately stops; approved evidence disappears from priority review and the patient's current-tag view refreshes immediately. Unrelated visit tags, other imports, existing appointments, offers, notification sequences and previously human-approved priorities are unchanged. Staff remain responsible for reassessing previous decisions; revocation is not an automatic clinical priority change.

## Data, retention and authorization

Migrations `0009_patient_record_import` and `0010_record_review_integrity` are additive. No bytes in 0001–0008 are changed. Existing visit-based tag/need fields gain nullable import provenance; visit sources continue working unchanged. A tag/need must have exactly one source: a valid visit or a patient/clinic-bound import. Database constraints, immutable-source triggers and application checks preserve that identity. Consent cannot be resurrected by update; a subsequent explicit grant creates a new import without reactivating old suggestions or evidence.

- `MedicalRecordImport`: patient, clinic, source, consent statement version, grant time, request UUID, consent state/version and revocation time. At most one active sample import per patient/clinic. Authorize/import retries with the same patient-bound UUID are idempotent; changed scope or a revoked UUID is rejected.
- `ImportedMedicalRecord`: immutable synthetic resource JSON, source text and content hash. Full-text GIN expression index supports English searches. Resources are server-owned synthetic fixtures only.
- `ImportedTagSuggestion`: immutable source/excerpt/original extraction/method, editable reviewed fields, PENDING/APPROVED/REJECTED state, optimistic version and reviewer, plus the confirmed tag link. Only pending suggestions receive versioned review. Approved links must point to their own original-source tag.
- `MedicalRecordAudit`: append-only consent, scoped access/search, extraction and clinical review/rejection/revocation history. Review events retain before/after fields, actor, reason and versions; generic activity logs never contain record text or private clinical notes. Search audit records only method/filter presence, not the search text. UI returns at most 100 recent audit entries; older history remains stored.

Patient access is self-only, including their own privately retained revoked archive. Clinician access requires an active account/membership, clinical author grant, matching clinic and active patient consent, all rechecked under the shared advisory lock `728194`. Ordinary clinic staff can use approved scheduling evidence through Part A, but cannot access this raw-record endpoint. Revoked sources and their snapshots are filtered out of the clinic tag API as well as generic scheduling state. All responses use `Cache-Control: no-store`; records are not written into browser localStorage, public logs or external recommendation requests.

Revocation stops use; it is **not deletion**. Synthetic source records, snapshots and audit history remain in PostgreSQL for accountability, visible only to the patient after revocation. This prototype has no retention-expiry/deletion workflow or claim of production regulatory compliance. Explicit synthetic fixture/reset cleanup uses the existing transaction-local reset guard; ordinary login, navigation, import, review and revocation never seed/reset. No existing/shared demo database was accessed during development.

## API contract

`GET /api/medical-records?q=<up to 160 chars>&mode=fulltext|keyword` returns scoped `imports`, `records`, `suggestions`, recent `audits`, permitted clinic/patient display names, `clinician`, `source` and retention text. Missing query defaults to all scoped records. Search limits record results to 200; samples contain four resources per grant. Unknown query fields are rejected. Returned JSON is evidence, not a permission grant.

`POST /api/medical-records` requires a current session and same-origin validation. Strict Zod schemas reject forged patient/actor/clinic attribution, source URLs, arbitrary records, urgency/priority fields and invalid timeframes. Actions:

```ts
{ type: 'authorizeImport', clinicId, source: 'CAREOUSEL_SYNTHETIC_FHIR_V1',
  consent: true, consentVersion: 'SYNTHETIC_V1', requestId: UUID }
{ type: 'extract', importId, mode: 'LOCAL_RULES' | 'LOCAL_AI' }
{ type: 'review', suggestionId, expectedVersion,
  decision: 'SAVE' | 'APPROVE' | 'REJECT', fields, reason }
{ type: 'revoke', importId, expectedVersion }
```

`fields` extends Part A's `medicalTagFields` with a canonical `service`. The source excerpt, import/resource, original extraction and author/reviewer identity cannot be client-controlled. Review validates date ordering. Unauthorized, unknown scope, validation and stale-version errors use the existing 401/403/404/400/409 conventions. Tag, need, revision, decision and audit writes are atomic; concurrent approval/revocation cannot leave usable evidence behind.

## Optional local AI adapter

No new AI SDK or external API key is required. Defaults are deterministic and do not invoke a model. For an already available local Ollama installation, an operator may explicitly set:

```sh
CAREOUSEL_LOCAL_AI_ORIGIN=http://127.0.0.1:11434
CAREOUSEL_LOCAL_AI_MODEL=<already-installed-local-model>
```

Only HTTP literal loopback origins (`127.0.0.1` or `[::1]`), no credentials/query/custom path, and no redirects are accepted. The operator must use a local inference model; this feature does not install models or enable a cloud model/provider. The request contains synthetic scheduling candidates only, not patient names, raw historical-condition records, clinical reviewers' edits or real medical records. HTTP timeout is 1.5 seconds, with an outer adapter timeout of 1.8 seconds.

Model JSON is validated against strict scheduling-only schemas. Unsupported urgency/priority fields, foreign/duplicate record IDs, invented excerpts/recommendations, changed service/timeframes/requirement flags or generated clinical statements, missing coverage, malformed output, errors or timeout fall back to deterministic extraction. AI may select exact source excerpts and shorter verbatim recommendations; it cannot change the canonical label, clinical note or clinical requirement fields. Both paths create pending suggestions only. External recommendation credentials/endpoints are never reused. The adapter request/validation path is tested with a mocked local model; no live LLM was installed or invoked during verification. AI quality is not established by these tests.

## Scope remaining

The source is a simulated FHIR-compatible Bundle/Condition/ServiceRequest fixture, not a certified full FHIR client/profile validator, hospital EHR integration or patient data import. Rules cover the provided English sample instructions and canonical Careousel services; unrecognized text requires manual clinician assessment. No automatic diagnosis or urgency classification exists.

Part C (after this PR is reviewed and merged) owns external appointment references and explicit independent links among multiple medical needs, requests and appointments. Current clinical needs do not change existing scheduling uniqueness/replacement semantics. No Part C implementation or public deployment is performed here.

## Verification

All database verification uses a **new isolated PostgreSQL 17 container**, local port 5550, database `careousel_test`. No existing Codespaces/cloud/shared database is accessed, migrated, reset or reseeded. Observed results: 68 unit tests, 92 PostgreSQL integration tests and 25 Chromium E2E passed; lint/typecheck, production build, format/diff checks and production/worker restart rehearsal passed. Lint retains one existing Cloudflare worker warning. The optional AI request path was mocked; normal demonstration used local rules/fallback. See VALIDATION.md for full coverage and inherited warnings.


## Part C integration update

Part B has merged as PR #25. Independent scheduling needs and patient-reported external appointments are now implemented in Part C; see [patient scheduling contracts](patient-needs.md). Earlier scope notes above describe the original PR. Clinical MedicalNeed records remain distinct from patient-owned PatientNeed scheduling contexts. Explicit approved same-service tag links support staff review without assigning priority or clearance.
