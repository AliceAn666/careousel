"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { waitlistHref } from "@/lib/clinic-navigation";
import {
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import type { Action, AppState } from "@/lib/types";
import { dateLabel, money, SERVICES } from "@/lib/config";
import { request } from "@/lib/api";
import { priorityLabel } from "@/lib/waitlist-priority";
import { Status, Empty, Modal } from "./ui";
export function ClinicSchedule({
  state,
  act,
}: {
  state: AppState;
  act: Action;
}) {
  const router = useRouter();
  const clinicId = state.user?.clinicId;
  const clinic = state.clinics.find((c) => c.id === clinicId);
  // Server state is already scoped; keep this view explicitly limited to
  // the authenticated clinic, including any local fixture or stale state.
  const clinicSlots = state.slots.filter((s) => s.clinicId === clinicId);
  const clinicSlotIds = new Set(clinicSlots.map((s) => s.id));
  const clinicCandidates = state.candidates.filter((c) =>
    clinicSlotIds.has(c.slotId),
  );
  const clinicBookings = state.bookings.filter((b) =>
    clinicSlotIds.has(b.slotId),
  );
  const [date, setDate] = useState(""),
    [show, setShow] = useState(false),
    [detailView, setDetailView] = useState<
      "confirmed" | "openings" | "matches" | null
    >(null);
  const confirmedBookings = clinicBookings.filter(
    (booking) => booking.status === "CONFIRMED",
  );
  const availableSlots = clinicSlots.filter(
    (slot) => slot.status === "AVAILABLE",
  );
  const visible = clinicSlots.filter((slot) => {
    const matchesDate =
      !date ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: slot.clinic.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(slot.start)) === date;
    if (!matchesDate) return false;
    if (detailView === "openings") return slot.status === "AVAILABLE";
    if (detailView === "confirmed")
      return confirmedBookings.some((booking) => booking.slotId === slot.id);
    return true;
  });
  const toggleDetail = (view: "confirmed" | "openings" | "matches") => {
    setDetailView((previous) => (previous === view ? null : view));
    setDate("");
  };
  return (
    <>
      <div className="insight-row">
        <button
          type="button"
          className={
            "card insight insight-action" +
            (detailView === "confirmed" ? " insight-active" : "")
          }
          onClick={() => toggleDetail("confirmed")}
          aria-label="View confirmed appointments"
          aria-expanded={detailView === "confirmed"}
          aria-controls="clinic-overview-details"
        >
          <CalendarDays aria-hidden="true" />
          <span className="insight-content">
            <span>Confirmed appointments</span>
            <strong>{confirmedBookings.length}</strong>
            <span className="insight-link">View appointments →</span>
          </span>
        </button>
        <button
          type="button"
          className={
            "card insight insight-action" +
            (detailView === "openings" ? " insight-active" : "")
          }
          onClick={() => toggleDetail("openings")}
          aria-label="View available openings"
          aria-expanded={detailView === "openings"}
          aria-controls="clinic-overview-details"
        >
          <ArrowDownLeft aria-hidden="true" />
          <span className="insight-content">
            <span>Available openings</span>
            <strong>{availableSlots.length}</strong>
            <span className="insight-link">View openings →</span>
          </span>
        </button>
        <button
          type="button"
          className={
            "card insight insight-action" +
            (detailView === "matches" ? " insight-active" : "")
          }
          onClick={() => toggleDetail("matches")}
          aria-label="View matched waitlist requests"
          aria-expanded={detailView === "matches"}
          aria-controls="clinic-overview-details"
        >
          <Users aria-hidden="true" />
          <span className="insight-content">
            <span>Matched waitlist requests</span>
            <strong>{clinicCandidates.length}</strong>
            <span className="insight-link">View matched patients →</span>
          </span>
        </button>
      </div>
      {detailView && (
        <section
          id="clinic-overview-details"
          className="card overview-detail-panel"
          role="region"
          aria-label={
            detailView === "confirmed"
              ? "Confirmed appointments details"
              : detailView === "openings"
                ? "Available openings details"
                : "Matched waitlist requests details"
          }
        >
          <div className="overview-detail-heading">
            <div>
              <h2>
                {detailView === "confirmed"
                  ? "Confirmed appointments"
                  : detailView === "openings"
                    ? "Available openings"
                    : "Matched waitlist requests"}
              </h2>
              <p>
                {detailView === "confirmed"
                  ? "Confirmed patients and scheduled appointments at this clinic."
                  : detailView === "openings"
                    ? "Available appointment times and services at this clinic."
                    : "Patient–opening matches within this clinic. A patient may match multiple openings."}
              </p>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => setDetailView(null)}
              aria-label="Close overview details"
            >
              Close
            </button>
          </div>
          {detailView === "confirmed" ? (
            confirmedBookings.length ? (
              <ul className="overview-detail-list">
                {confirmedBookings.map((booking) => (
                  <li className="overview-detail-item" key={booking.id}>
                    <div>
                      <strong>{booking.patient.name}</strong>
                      <p>
                        {booking.slot.service} · {booking.slot.provider}
                      </p>
                      <small>{dateLabel(booking.slot.start)}</small>
                    </div>
                    <Status value={booking.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="No confirmed appointments"
                body="Confirmed bookings will appear here."
              />
            )
          ) : detailView === "openings" ? (
            availableSlots.length ? (
              <ul className="overview-detail-list">
                {availableSlots.map((slot) => (
                  <li className="overview-detail-item" key={slot.id}>
                    <div>
                      <strong>
                        {slot.service} · {slot.provider}
                      </strong>
                      <p>
                        {dateLabel(slot.start)} · {money(slot.price)} estimated
                      </p>
                    </div>
                    <Status value={slot.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="No available openings"
                body="Create a new opening to make a slot available."
              />
            )
          ) : (
            <>
              {clinicCandidates.length ? (
                <ul className="overview-detail-list">
                  {clinicCandidates.map((candidate) => {
                    const slot = clinicSlots.find(
                      (item) => item.id === candidate.slotId,
                    );
                    return (
                      <li className="overview-detail-item" key={candidate.id}>
                        <div>
                          <strong>{candidate.name}</strong>
                          <p>
                            {slot ? (
                              <>
                                {slot.service} · {dateLabel(slot.start)}
                              </>
                            ) : (
                              "Matched waitlist request"
                            )}
                          </p>
                          <small>
                            {priorityLabel(candidate.priority?.level)} · Staff
                            review / clearance may be required
                          </small>
                        </div>
                        <Link
                          className="secondary overview-review-slot"
                          href={
                            "/clinic/waitlists?slotId=" +
                            encodeURIComponent(candidate.slotId)
                          }
                        >
                          Review this slot
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty
                  title="No matched waitlist requests"
                  body="Matched waitlist candidates will appear here."
                />
              )}
              <Link
                className="secondary overview-review-link"
                href="/clinic/waitlists"
              >
                Review waitlist matches{" "}
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </>
          )}
        </section>
      )}
      <div className="section-title">
        <div>
          <h2>Appointment schedule</h2>
          <p>
            {clinic
              ? `Showing ${clinic.name} appointments only.`
              : "Your clinic schedule"}{" "}
            Waitlist candidates may come from any participating clinic.
            {detailView === "confirmed"
              ? " Filtered to confirmed appointments."
              : detailView === "openings"
                ? " Filtered to available openings."
                : ""}
          </p>
        </div>
        <button className="primary" onClick={() => setShow(true)}>
          <Plus size={17} />
          New opening
        </button>
      </div>
      <label className="inline-filter">
        Filter by date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="text-button" onClick={() => setDate("")}>
          Clear
        </button>
      </label>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Appointment</th>
              <th>Service / provider</th>
              <th>Patient</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const b = clinicBookings.find(
                (booking) =>
                  booking.slotId === s.id && booking.status === "CONFIRMED",
              );
              const matches = clinicCandidates.filter((c) => c.slotId === s.id);
              const reviewed = matches.filter((c) => {
                const request = state.priorityRequests.find(
                  (w) => w.id === c.waitlistId,
                );
                const priority = c.priority;
                return (
                  priority?.reviewState === "APPROVED" &&
                  !!priority.level &&
                  (!(s.requiresReferral || request?.requiresReferral) ||
                    priority.referralApproved) &&
                  (!(
                    s.requiresAuthorization || request?.requiresAuthorization
                  ) ||
                    priority.authorizationApproved)
                );
              });
              const unreviewed = matches.length - reviewed.length;
              return (
                <tr key={s.id} data-slot-id={s.id}>
                  <td>
                    <strong>{dateLabel(s.start)}</strong>
                    <small>{money(s.price)} estimated</small>
                  </td>
                  <td>
                    {s.service}
                    <small>{s.provider}</small>
                  </td>
                  <td>{b?.patient.name ?? "—"}</td>
                  <td>
                    <Status value={s.status} />
                  </td>
                  <td>
                    {b ? (
                      <button
                        className="danger"
                        onClick={() => {
                          if (
                            confirm(
                              `Cancel ${b.patient.name}’s appointment and release the slot?`,
                            )
                          )
                            void act({ type: "cancel", bookingId: b.id }).then(
                              (ok) => {
                                if (ok)
                                  router.push(waitlistHref("matches", s.id));
                              },
                            );
                        }}
                      >
                        Cancel & release
                      </button>
                    ) : s.status === "AVAILABLE" ? (
                      <div className="schedule-priority-summary">
                        {matches.length ? (
                          <>
                            <div
                              className="schedule-priority-groups"
                              aria-label={`Priority groups for ${s.service} ${dateLabel(s.start)}`}
                            >
                              {(["P1", "P2", "P3", "P4"] as const).map(
                                (level) => (
                                  <span
                                    key={level}
                                    className="schedule-priority-count"
                                  >
                                    {level}:{" "}
                                    {
                                      reviewed.filter(
                                        (c) => c.priority?.level === level,
                                      ).length
                                    }
                                  </span>
                                ),
                              )}
                              {unreviewed > 0 && (
                                <span className="schedule-unreviewed">
                                  Review / clearance: {unreviewed}
                                </span>
                              )}
                            </div>
                            <small>
                              Matched requests · final eligibility checked at
                              review
                            </small>
                          </>
                        ) : (
                          <span className="muted">
                            No matching waitlist requests
                          </span>
                        )}
                        <button
                          type="button"
                          className="secondary schedule-review-groups"
                          onClick={() =>
                            router.push(
                              `/clinic/waitlists?slotId=${encodeURIComponent(s.id)}`,
                            )
                          }
                        >
                          Review Waitlist Matches
                        </button>
                      </div>
                    ) : (
                      <span className="muted">Awaiting patient response</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <Empty
            title="No appointments on this date"
            body="Try another date or create a new opening."
          />
        )}
      </div>
      {show && (
        <Modal
          title="Create an appointment opening"
          onClose={() => setShow(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await act({
                  type: "createSlot",
                  service: f.get("service"),
                  start: new Date(String(f.get("start"))).toISOString(),
                  price: Math.round(Number(f.get("price")) * 100),
                  requiresReferral: f.get("requiresReferral") === "on",
                  requiresAuthorization:
                    f.get("requiresAuthorization") === "on",
                })
              )
                setShow(false);
            }}
          >
            <label>
              Specialty
              <select name="service">
                {SERVICES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Start date & time (your device timezone)
              <input type="datetime-local" name="start" required />
            </label>
            <label>
              Estimated cost ($)
              <input
                name="price"
                type="number"
                min="0"
                max="10000"
                defaultValue="120"
                required
              />
            </label>
            <label className="sequence-recipient">
              <input type="checkbox" name="requiresReferral" />
              Referral required (synthetic review)
            </label>
            <label className="sequence-recipient">
              <input type="checkbox" name="requiresAuthorization" />
              Authorization required (synthetic review)
            </label>
            <p className="demo-note">
              30-minute visit with Dr. Maya Lin. All demo plans accepted.
            </p>
            <button className="primary full">Create opening</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Matches({
  state,
  act,
  slotId,
  requestId,
}: {
  state: AppState;
  act: Action;
  slotId?: string;
  requestId?: string;
}) {
  const [summary, setSummary] = useState<{
      source: string;
      summary: string;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [aiError, setAiError] = useState("");
  const slot = state.slots.find(
    (s) => s.id === slotId && s.clinicId === state.user?.clinicId,
  );
  const candidates = state.candidates.filter((c) => c.slotId === slot?.id);
  return (
    <>
      <div className="info-banner">
        <Sparkles />
        <div>
          <strong>Intelligent matching. Human decisions.</strong>
          <p>
            Eligibility is checked automatically. Candidates are ordered by
            waitlist join time within the shared pool. P1–P4 labels require
            explicit clinic staff review; patient questionnaires and AI never
            assign urgency. Clinic staff authorize each notification sequence.
            Legacy single-patient offers remain available for openings outside a
            group workflow.
          </p>
        </div>
      </div>
      <div className="matches-workspace">
        <section>
          {slot && slot.status === "AVAILABLE" ? (
            <>
              <div className="section-title">
                <div>
                  <h2>
                    Suggested patients{" "}
                    <span className="result-count">{candidates.length}</span>
                  </h2>
                  <p>
                    {slot.service} · {dateLabel(slot.start)}
                  </p>
                </div>
              </div>
              <div className="recommendation">
                <span className="eyebrow">
                  <Sparkles size={14} />
                  ASSISTED REVIEW
                </span>
                <p>
                  {summary?.summary ??
                    "Get a concise explanation of the eligible candidates before making your decision. Matching works even without an external AI service."}
                </p>
                <button
                  className="secondary"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    setAiError("");
                    try {
                      setSummary(
                        await request("/api/recommendations", {
                          slotId: slot.id,
                        }),
                      );
                    } catch (e) {
                      setAiError((e as Error).message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {loading ? "Preparing…" : "Explain recommendations"}
                  <Sparkles size={15} />
                </button>
                {summary && (
                  <small>
                    {summary.source === "ai"
                      ? "AI-assisted explanation — verify before approval"
                      : "Local rules fallback · no external AI required"}
                  </small>
                )}
                {aiError && <p role="alert">{aiError}</p>}
              </div>
              {!candidates.length ? (
                <Empty
                  title="No eligible candidates yet"
                  body="No current scheduling matches. Candidates must match service, insurance, preferences and appointment-conflict checks; specialist services require reviewed invitations."
                />
              ) : (
                <div className="stack">
                  {candidates.map((c, i) => (
                    <article
                      className="card candidate"
                      key={c.id}
                      data-request-id={c.waitlistId}
                      aria-label={`${c.name} matching request`}
                      data-selected={c.waitlistId === requestId}
                    >
                      <div className="candidate-heading">
                        <span className="avatar mint">
                          {c.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <div>
                          <h3>{c.name}</h3>
                          <p>FIFO position #{i + 1}</p>
                        </div>
                        <span className="status active">Scheduling match</span>
                      </div>
                      <div className="priority-hint">
                        <span className="eyebrow">
                          REQUEST PRIORITY · YOUR CLINIC
                        </span>
                        <p>{priorityLabel(c.priority?.level)}</p>
                        <p>
                          {c.priority?.reviewState !== "APPROVED" ||
                          ((slot.requiresReferral ||
                            state.priorityRequests.find(
                              (r) => r.id === c.waitlistId,
                            )?.requiresReferral) &&
                            !c.priority?.referralApproved) ||
                          ((slot.requiresAuthorization ||
                            state.priorityRequests.find(
                              (r) => r.id === c.waitlistId,
                            )?.requiresAuthorization) &&
                            !c.priority?.authorizationApproved)
                            ? "Priority or eligibility clearance review required before group notifications."
                            : "Approved priority; final eligibility is revalidated before sending."}
                        </p>
                        <Link
                          className="secondary context-link"
                          scroll={false}
                          href={waitlistHref(
                            "priorities",
                            slot.id,
                            c.waitlistId,
                          )}
                        >
                          Review Priority
                        </Link>
                        <small>
                          Staff-reviewed only. This label does not change
                          eligibility or reserve an appointment.
                        </small>
                      </div>
                      <div className="reason-list">
                        {c.reasons.map((r) => (
                          <span key={r}>
                            <CheckCircle2 size={14} />
                            {r}
                          </span>
                        ))}
                      </div>
                      <details className="legacy-offer">
                        <summary>Legacy single-patient invitation</summary>
                        <p>
                          Use only outside an automatic group sequence. Existing
                          server eligibility and approval rules apply.
                        </p>
                        <button
                          className="secondary"
                          onClick={() => {
                            const reason = prompt(
                              "Reason for approving this eligible patient:",
                              "Reviewed eligibility and scheduling preferences",
                            );
                            if (reason)
                              void act({
                                type: "approve",
                                slotId: slot.id,
                                waitlistId: c.waitlistId,
                                reason,
                              });
                          }}
                        >
                          Approve & send offer <ArrowRight size={16} />
                        </button>
                      </details>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Empty
              title="No available opening selected"
              body="Choose an available opening above. Booked or held slots can still be monitored under Notifications."
            />
          )}
        </section>
      </div>
    </>
  );
}
export function ActivityFeed({ state }: { state: AppState }) {
  return (
    <section className="card">
      <h2>Scheduling audit trail</h2>
      <p className="muted">Only activity from your clinic is shown.</p>
      {state.activity.length ? (
        state.activity.map((a) => (
          <div className="activity" key={a.id}>
            <span className="activity-dot" />
            <div>
              <strong>{a.action}</strong>
              <p>
                {a.actor} · {dateLabel(a.createdAt)}
              </p>
            </div>
          </div>
        ))
      ) : (
        <Empty
          title="Ready for your first action"
          body="Booking changes and approvals will appear here."
        />
      )}
    </section>
  );
}
