"use client";
import { useState } from "react";
import { NotificationManager } from "./notification-manager";
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
  const [date, setDate] = useState(""),
    [show, setShow] = useState(false),
    [detailView, setDetailView] = useState<
      "confirmed" | "openings" | "matches" | null
    >(null);
  const confirmedBookings = state.bookings.filter(
    (booking) => booking.status === "CONFIRMED",
  );
  const availableSlots = state.slots.filter(
    (slot) => slot.status === "AVAILABLE",
  );
  const visible = state.slots.filter((slot) => {
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
          className={"card insight insight-action" + (detailView === "confirmed" ? " insight-active" : "")}
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
          className={"card insight insight-action" + (detailView === "openings" ? " insight-active" : "")}
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
          className={"card insight insight-action" + (detailView === "matches" ? " insight-active" : "")}
          onClick={() => toggleDetail("matches")}
          aria-label="View eligible matches"
          aria-expanded={detailView === "matches"}
          aria-controls="clinic-overview-details"
        >
          <Users aria-hidden="true" />
          <span className="insight-content">
            <span>Eligible matches</span>
            <strong>{state.candidates.length}</strong>
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
                : "Eligible matches details"
          }
        >
          <div className="overview-detail-heading">
            <div>
              <h2>
                {detailView === "confirmed"
                  ? "Confirmed appointments"
                  : detailView === "openings"
                    ? "Available openings"
                    : "Eligible matches"}
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
                      <p>{booking.slot.service} · {booking.slot.provider}</p>
                      <small>{dateLabel(booking.slot.start)}</small>
                    </div>
                    <Status value={booking.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No confirmed appointments" body="Confirmed bookings will appear here." />
            )
          ) : detailView === "openings" ? (
            availableSlots.length ? (
              <ul className="overview-detail-list">
                {availableSlots.map((slot) => (
                  <li className="overview-detail-item" key={slot.id}>
                    <div>
                      <strong>{slot.service} · {slot.provider}</strong>
                      <p>{dateLabel(slot.start)} · {money(slot.price)} estimated</p>
                    </div>
                    <Status value={slot.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No available openings" body="Create a new opening to make a slot available." />
            )
          ) : (
            <>
              {state.candidates.length ? (
                <ul className="overview-detail-list">
                  {state.candidates.map((candidate) => {
                    const slot = state.slots.find(
                      (item) => item.id === candidate.slotId,
                    );
                    return (
                      <li className="overview-detail-item" key={candidate.id}>
                        <div>
                          <strong>{candidate.name}</strong>
                          <p>
                            {slot ? (
                              <>{slot.service} · {dateLabel(slot.start)}</>
                            ) : (
                              "Eligible waitlist request"
                            )}
                          </p>
                          <small>
                            {priorityLabel(candidate.priority?.level)} · Staff review required
                          </small>
                        </div>
                        <span className="status active">Eligible</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Empty title="No eligible matches" body="Eligible waitlist candidates will appear here." />
              )}
              <a className="secondary overview-review-link" href="/clinic/waitlists">
                Review waitlist matches <ArrowRight size={17} aria-hidden="true" />
              </a>
            </>
          )}
        </section>
      )}
      <div className="section-title">
        <div>
          <h2>Appointment schedule</h2>
          <p>
            {detailView === "confirmed"
              ? "Showing confirmed appointments. Close the overview details to see every slot."
              : detailView === "openings"
                ? "Showing available openings. Close the overview details to see every slot."
                : "Cancellations automatically surface eligible waitlist candidates."}
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
              const b = state.bookings.find(
                (b) => b.slotId === s.id && b.status === "CONFIRMED",
              );
              return (
                <tr key={s.id}>
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
                            void act({ type: "cancel", bookingId: b.id });
                        }}
                      >
                        Cancel & release
                      </button>
                    ) : (
                      <span className="muted">
                        {s.status === "HELD"
                          ? "Awaiting patient response"
                          : `${state.candidates.filter((c) => c.slotId === s.id).length} eligible matches`}
                      </span>
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
export function Matches({ state, act }: { state: AppState; act: Action }) {
  return (
    <>
      <NotificationManager state={state} />
      <LegacyMatches state={state} act={act} />
    </>
  );
}
function LegacyMatches({ state, act }: { state: AppState; act: Action }) {
  const [selected, setSelected] = useState(""),
    [summary, setSummary] = useState<{
      source: string;
      summary: string;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [aiError, setAiError] = useState("");
  const slots = state.slots.filter((s) => s.status === "AVAILABLE");
  const slot =
    slots.find((s) => s.id === selected) ??
    slots.find((s) => s.id === "earlier") ??
    slots[0];
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
      <div className="matches-layout">
        <section className="card openings">
          <h2>Available openings</h2>
          <p className="muted">Select a slot to review matches</p>
          {slots.map((s) => (
            <button
              key={s.id}
              className={`opening ${slot?.id === s.id ? "selected" : ""}`}
              onClick={() => {
                setSelected(s.id);
                setSummary(null);
                setAiError("");
              }}
            >
              <span className="eyebrow">{s.service}</span>
              <strong>{dateLabel(s.start)}</strong>
              <span>
                {state.candidates.filter((c) => c.slotId === s.id).length}{" "}
                eligible candidates
              </span>
            </button>
          ))}
          {!slots.length && (
            <p>No available openings. Cancel a booking or create a slot.</p>
          )}
        </section>
        <section>
          {slot && (
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
                  body="The opening remains available for direct booking. Candidates must match all required preferences."
                />
              ) : (
                <div className="stack">
                  {candidates.map((c, i) => (
                    <article className="card candidate" key={c.id}>
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
                        <span className="status active">Eligible</span>
                      </div>
                      <div className="priority-hint">
                        <span className="eyebrow">
                          REQUEST PRIORITY · YOUR CLINIC
                        </span>
                        <p>{priorityLabel(c.priority?.level)}</p>
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
                      <button
                        className="primary"
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
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <section className="section-title">
        <h2>Recent invitations</h2>
      </section>
      <div className="stack">
        {state.offers.map((o) => (
          <div key={o.id} className="card request-card">
            <div>
              <h3>{o.slot.service}</h3>
              <p>
                {dateLabel(o.slot.start)} · {o.reason}
              </p>
            </div>
            <Status value={o.status} />
          </div>
        ))}
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
