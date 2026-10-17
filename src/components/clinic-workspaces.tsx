"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Action, AppState } from "@/lib/types";
import { dateLabel } from "@/lib/config";
import { waitlistHref, waitlistTab } from "@/lib/clinic-navigation";
import { Matches } from "./clinic-portal";
import { Priorities } from "./clinic-priorities";
import { NotificationManager } from "./notification-manager";
import { MedicalRecords } from "./medical-records";
import { MedicalTags } from "./medical-tags";

export function WaitlistWorkspace(props: { state: AppState; act: Action }) {
  return (
    <Suspense fallback={<p role="status">Loading waitlist workspace…</p>}>
      <WaitlistContent {...props} />
    </Suspense>
  );
}
function WaitlistContent({ state, act }: { state: AppState; act: Action }) {
  const params = useSearchParams(),
    path = usePathname(),
    router = useRouter();
  const tab = waitlistTab(path, params.get("tab"));
  const slots = state.slots.filter((s) => s.clinicId === state.user?.clinicId);
  const requested = params.get("slotId");
  // An explicit stale/foreign ID never silently selects a different opening.
  const slot = requested
    ? slots.find((s) => s.id === requested)
    : (slots.find((s) => s.id === "earlier" && s.status === "AVAILABLE") ??
      slots.find((s) => s.status === "AVAILABLE") ??
      slots[0]);
  const requestId = params.get("requestId") ?? undefined;
  const href = (next: typeof tab) =>
    waitlistHref(next, slot?.id ?? requested ?? undefined, requestId);
  return (
    <div className="clinic-workspace stack">
      <p>
        Select an opening, review priorities, then authorize notifications. One
        shared cross-clinic waitlist pool.
      </p>
      <label>
        Selected opening
        <select
          aria-label="Selected opening"
          value={slot?.id ?? ""}
          onChange={(e) =>
            router.push(waitlistHref(tab, e.target.value), { scroll: false })
          }
        >
          {!slot && <option value="">Select an opening</option>}
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.service} · {dateLabel(s.start)} · {s.status}
            </option>
          ))}
        </select>
      </label>
      {requested && !slot && (
        <p role="alert">
          This opening is unavailable or outside your clinic access. Select
          another opening.
        </p>
      )}
      <nav aria-label="Waitlist sections" className="workspace-tabs">
        {(
          [
            ["matches", "Matches"],
            ["priorities", "Priority Review"],
            ["notifications", "Notifications"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            scroll={false}
            href={href(value)}
            aria-current={tab === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section hidden={tab !== "matches"} aria-label="Matches">
        <Matches
          key={slot?.id ?? "none"}
          state={state}
          act={act}
          slotId={slot?.id}
          requestId={requestId}
        />
      </section>
      <section hidden={tab !== "priorities"} aria-label="Priority Review">
        <Link
          className="secondary context-link"
          scroll={false}
          href={href("matches")}
        >
          Back to Matches
        </Link>
        <Priorities
          state={state}
          act={act}
          requestId={requestId}
          slotId={slot?.id}
        />
      </section>
      <section hidden={tab !== "notifications"} aria-label="Notifications">
        <Link
          className="secondary context-link"
          scroll={false}
          href={href("matches")}
        >
          Back to Matches
        </Link>
        {slot && (
          <NotificationManager
            key={slot.id}
            state={state}
            slotId={slot.id}
            active={tab === "notifications"}
          />
        )}
        <details className="card">
          <summary>Invitation history (including legacy offers)</summary>
          {state.offers
            .filter((o) => o.slotId === slot?.id)
            .map((o) => (
              <p key={o.id}>
                {o.slot.service} · {dateLabel(o.slot.start)} · {o.status} ·{" "}
                {o.reason}
              </p>
            ))}
          {!state.offers.some((o) => o.slotId === slot?.id) && (
            <p>No invitations for this opening.</p>
          )}
        </details>
      </section>
    </div>
  );
}
export function ClinicalRecordsWorkspace({ state }: { state: AppState }) {
  const path = usePathname();
  const canReview = state.clinicalAccess === true;
  const records =
    path === "/clinic/medical-records" ||
    (path === "/clinic/records" && canReview);
  return (
    <div className="clinic-workspace stack">
      <p>
        Clinician-approved record evidence can support medical tags and
        scheduling review. Clinical approval never assigns P1–P4 priority or
        clears referrals automatically.
      </p>
      <nav aria-label="Clinical record sections" className="workspace-tabs">
        {canReview ? (
          <Link
            href="/clinic/medical-records"
            aria-current={records ? "page" : undefined}
          >
            Record Review
          </Link>
        ) : (
          <span
            aria-disabled="true"
            title="Explicit clinical author permission required"
          >
            Record Review · Restricted
          </span>
        )}
        <Link
          href="/clinic/medical-tags"
          aria-current={!records ? "page" : undefined}
        >
          Medical Tags
        </Link>
      </nav>
      {records ? (
        canReview ? (
          <MedicalRecords />
        ) : (
          <p role="alert">
            Record Review requires explicit clinical author permission. Private
            records and notes are unavailable to ordinary staff.
          </p>
        )
      ) : (
        <MedicalTags />
      )}
    </div>
  );
}
