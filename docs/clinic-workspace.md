# Clinic workspace navigation

The primary sidebar has exactly three entries: **Schedule**, **Waitlist Management**, **Clinical Records**. Staff access management and activity bookmarks remain secondary tools. All routes still use the persistent application shell and client navigation.

## Scheduling workflow

1. Schedule retains clinic-scoped overview drilldowns, actual bookings, date filtering, opening creation and cancellation. **Review Waitlist Matches** on an available row opens that exact slot. Successful cancellation opens its released slot directly; failed cancellation leaves the user in place.
2. Waitlist Management has one opening selector and three sections: **Matches**, **Priority Review**, **Notifications**. `slotId`, `requestId` and `tab` in the URL preserve context across sections, refresh and browser Back. Changing the opening clears the request context and any notification draft; an explicit inaccessible/stale slot never silently falls back to another opening.
3. Matches reuses existing scheduling candidates, FIFO explanations, local recommendation fallback and clinic approval. Each candidate links to **Review Priority**, preserving the opening and focusing one request. Requirement/priority review is distinct from scheduling compatibility. Staff may return via **Back to Matches**; the original request remains highlighted. **Show all requests** clears only request focus.
4. Notifications owns the existing automatic sequence controls and slot-scoped invitation history. Preview is read-only. Staff must select recipients, choose a first group, provide a reason and explicitly authorize. Section switches preserve an unsent draft in memory for the same opening, but reload intentionally does not persist recipient selections. Switching openings unmounts the draft, so recipient approvals never carry into another slot.
5. The legacy single-recipient approval remains inside a clearly labeled expandable candidate action. Its history is in Notifications, including legacy offers. There is no second notification manager or independent opening selector.

Existing URLs remain functional:

| Bookmark                                                | Active parent / section                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/clinic/schedule`                                      | Schedule                                                                               |
| `/clinic/waitlists`                                     | Waitlist Management / Matches                                                          |
| `/clinic/waitlists?slotId=…&tab=priorities&requestId=…` | Waitlist Management / Priority Review                                                  |
| `/clinic/priorities` (including context query)          | Waitlist Management / Priority Review                                                  |
| `/clinic/waitlists?slotId=…&tab=notifications`          | Waitlist Management / Notifications                                                    |
| `/clinic/records`                                       | Clinical Records / Record Review for clinical authors, Medical Tags for ordinary staff |
| `/clinic/medical-records`                               | Clinical Records / Record Review (permission required)                                 |
| `/clinic/medical-tags`                                  | Clinical Records / Medical Tags                                                        |

Identifiers in URLs are navigation hints, never authorization. No notes, excerpts or record text enter URL parameters or browser storage.

## Clinical permissions

`/api/state` adds only a `clinicalAccess` boolean, computed under the existing scheduling lock using the existing clinical-author authorization helper after active staff access validation. Anonymous/patient/ordinary-staff state is false. This flag controls navigation affordances; all clinical APIs retain their independent consent, membership, clinic and clinical-author checks. It grants no permission.

Clinical Records shares an explanation and two labeled sections. Ordinary staff see Record Review as restricted and can view only the existing approved scheduling projection under Medical Tags. Direct record bookmarks explain the denial without mounting the records component. Explicit clinical authors use the existing record review and tag editors, preserving source provenance, consent/revocation, review/version history and audit. Clinical evidence approval never assigns P1–P4 or clears referral/authorization requirements.

## Invariants and boundaries

No migration, seed change, worker change, domain mutation or matching rule change is included. All clinics share the same pool; there is no home-clinic boost, internal-first period or external release stage. Human priority approval, referral/authorization clearance, the 180-minute minimum group interval, preview tokens, recipient revalidation, expiry, atomic replacement, concurrency and independent medical needs remain server-enforced. Tests use an explicitly isolated PostgreSQL database.

This branch started at CI-successful main `86afcf8` and fast-forwarded to latest main `837825a` before submission; that intervening commit only adds Render configuration, which this work does not execute or modify. At implementation time PR #38 (basic-care direct-booking policy) was still open. This navigation PR does not copy that separate change or weaken any booking guard; its stronger direct-booking restrictions still require PR #38 review/merge. Recheck combined CI when either PR changes the shared application shell.

Responsive navigation uses three distinct icons (calendar-days, users, file-heart), readable contrast, compact 48px desktop targets, a subtle active marker and wrapping section links. At 601–850px the three primary entries share the available width; at 600px and below they stack into readable rows. Section links wrap without horizontal scrolling. Patient navigation styling is unchanged.
