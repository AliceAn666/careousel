# API contract v1

The executable source is src/lib/contracts/index.ts (`api`, `ApiInput<K>`, `ApiResponse<K>`). Every descriptor defines method, path, validated input and success response. This milestone implements no API handlers or business services. DTOs deliberately exclude unrestricted user/audit details. A patientId is a PatientProfile ID, not a User ID. Member 1 coordinates breaking contract changes with all module owners; database changes stay with Member 2.

## Transport and errors

JSON success: `{ "data": ... }`. Lists: `{ "data": { "items": [], "nextCursor": null } }`. Path IDs are UUIDs. GET input uses query parameters; adapters must explicitly decode integers, booleans (`true`/`false` only), and arrays before parsing the descriptor. Reject unknown input fields. PATCH waitlist replaces the complete preference object, not a partial merge. Page cursors are last returned IDs, ordered by createdAt then ID (slots by startsAt then ID); server must scope cursor lookup and filters to authorization. Default page size 25, maximum 100.

Timestamps are UTC ISO strings with Z; date-only preferences are clinic-local calendar dates; minutes/weekday use clinic local time (Sunday=0). Intervals are half-open. Empty clinic/city/weekday arrays mean unrestricted within authorized eligibility, never authorization. Null time/date bounds mean unbounded. Currency is USD for the agreed P0 default; amounts are integer cents. Insurance is simulated; no plan plus self-pay=false is invalid. Server checks real eligibility, existence, future time and cross-field database relations.

Errors use apiErrorSchema: `{ "error": { "code": "CONFLICT", "message": "...", "requestId": "..." } }`, optional fieldErrors map. HTTP mapping: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT/OFFER_EXPIRED/STALE_STATE 409, INTERNAL_ERROR 500. Redact internal details and other users' records. On stale/conflict responses clients refresh authoritative state; never show local fake success.

All mutations require an Idempotency-Key UUID header scoped to actor+operation; persist request fingerprint/result transactionally, reject reuse with changed input (409), replay identical requests. This persistence is backend work, not implemented here. Use server-issued HTTP-only sessions, membership/ownership checks and same-origin/CSRF enforcement for cookie mutations. Reads must also enforce expiry. No route is publicly authorized merely because it appears in a descriptor.

## Endpoint ownership and access

| Descriptor group | Access / requirements |
| --- | --- |
| search, clinic, catalogs | Authenticated demo user; availability and catalog only, no unrelated identities |
| bookings, book, cancel | Patient owns record; staff cancellation only within slot clinic membership; book actor derived from session |
| waitlists, joinWaitlist, editWaitlist, withdraw | Patient ownership; active uniqueness per patient/service; revalidate/invalidate affected offers |
| schedule, createSlot, withdrawSlot, candidates, regenerate, dismiss, approve, activity | Staff membership for resolved clinic; no cross-clinic history; future slots and slot service must belong to clinic |
| offer, respond | Offer's patient only; expiry/eligibility/state rechecked; response includes booking only on acceptance |
| notifications, readNotification | Session user only; no client user ID |
| session | Authenticated session; clinic IDs come from server memberships |
| enterDemo | Demo mode only; allowlisted persona, signed session; no arbitrary role selection |
| reset | Demo mode and server-authorized administrator, exact confirmation, isolated demo database safeguards |

Candidates disclose only authorized suggestion IDs, waitlist IDs and structured display reasons in v1; richer synthetic patient cards require an explicitly reviewed scoped DTO extension. Clinic schedule currently returns slot availability, not cross-clinic patient history. Teams must propose needed additions centrally rather than invent parallel contracts.

## Canonical states

| Entity | Values / transitions |
| --- | --- |
| Slot | AVAILABLE → HELD → BOOKED; HELD → AVAILABLE on decline/expiry/revoke; BOOKED → AVAILABLE on cancellation/replacement; AVAILABLE → WITHDRAWN by staff; revoke hold before withdrawal |
| Booking | CONFIRMED → CANCELLED or RESCHEDULED; history immutable |
| Waitlist | ACTIVE → FULFILLED or WITHDRAWN; pending/declined/expired offer leaves ACTIVE |
| Offer | PENDING → ACCEPTED, DECLINED, EXPIRED or REVOKED; terminal states never reused |
| Suggestion | ELIGIBLE or DISMISSED; suggestions reserve nothing |

Values exactly match PR #2, including WITHDRAWN slot state. Schemas validate values; they do not implement transitions. Ten-minute offer lifetime is centralized in src/lib/config.ts. Approval is a human decision before notification/hold. Server clock is authoritative; service tests inject it. Re-evaluate eligibility at every mutation, rank by waitlist createdAt then ID, and never infer clinical urgency.
