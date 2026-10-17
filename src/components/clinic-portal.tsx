"use client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import type { Action, AppState } from "@/lib/types";
import { dateLabel, money, pacificDate, SERVICES } from "@/lib/config";
import { monthDays, monthKey, shiftMonth, WEEKDAYS } from "./patient-portal";
import { Status, Empty, Modal, SeverityTags } from "./ui";
export function ClinicSchedule({
  state,
  act,
}: {
  state: AppState;
  act: Action;
}) {
  const [date, setDate] = useState(""),
    [show, setShow] = useState(false);
  const visible = state.slots.filter(
    (s) =>
      !date ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: s.clinic.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(s.start)) === date,
  );
  return (
    <>
      <div className="insight-row">
        <div className="card insight">
          <CalendarDays />
          <div>
            <span>Confirmed appointments</span>
            <strong>
              {state.bookings.filter((b) => b.status === "CONFIRMED").length}
            </strong>
          </div>
        </div>
        <div className="card insight">
          <ArrowDownLeft />
          <div>
            <span>Available openings</span>
            <strong>
              {state.slots.filter((s) => s.status === "AVAILABLE").length}
            </strong>
          </div>
        </div>
        <div className="card insight">
          <Users />
          <div>
            <span>Eligible matches</span>
            <strong>{state.candidates.length}</strong>
          </div>
        </div>
      </div>
      <div className="section-title">
        <div>
          <h2>Appointment schedule</h2>
          <p>
            Cancellations automatically surface eligible waitlist candidates.
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
  const count = (slotId: string) =>
    state.candidates.filter((c) => c.slotId === slotId).length;
  const open = state.slots.filter((s) => s.status === "AVAILABLE");
  const [selected, setSelected] = useState("");
  const slot =
    open.find((s) => s.id === selected) ??
    open.find((s) => s.id === "earlier") ??
    open.find((s) => count(s.id) > 0) ??
    open[0];
  const candidates = state.candidates.filter((c) => c.slotId === slot?.id);
  const today = pacificDate(new Date());
  const lastDay = state.slots.length
    ? pacificDate(state.slots[state.slots.length - 1].start)
    : today;
  const [month, setMonth] = useState(
    monthKey(slot ? pacificDate(slot.start) : today),
  );
  // One numbered icon per opening, grouped by Pacific calendar day.
  const byDay = new Map<string, typeof state.slots>();
  for (const s of state.slots) {
    const key = pacificDate(s.start);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const { lead, days } = monthDays(month);
  const monthTitle = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  return (
    <>
      <div className="info-banner">
        <Sparkles />
        <div>
          <strong>Intelligent matching. Human decisions.</strong>
          <p>
            Eligibility is checked automatically. Candidates are ordered by
            waitlist join time. Severity scores are hints from patient
            questionnaires or your clinic&apos;s priorities; they do not change
            the order. Clinic staff make every final offer.
          </p>
        </div>
      </div>
      <div className="section-title">
        <div>
          <h2>Available openings</h2>
          <p>
            Each number is one opening and how many eligible candidates it has.
            Hover for details; choose one to review its candidates.
          </p>
        </div>
      </div>
      <section
        className="card care-calendar slot-calendar"
        aria-label="Openings calendar"
      >
        <div className="calendar-toolbar">
          <button
            className="icon-button"
            aria-label="Previous month"
            disabled={month <= monthKey(today)}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <h3>{monthTitle}</h3>
          <button
            className="icon-button"
            aria-label="Next month"
            disabled={month >= monthKey(lastDay)}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <ul className="clinic-legend">
          <li>
            <span className="slot-num">3</span>Open · eligible candidates
          </li>
          <li>
            <span className="slot-num selected">3</span>Selected
          </li>
          <li>
            <span className="slot-num dim">0</span>Booked or invitation pending
          </li>
        </ul>
        <div className="calendar-grid">
          {WEEKDAYS.map((d) => (
            <div className="calendar-weekday" key={d}>
              {d}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div className="calendar-day blank" key={`lead-${i}`} />
          ))}
          {days.map(({ day, weekday, key }) => (
            <div
              key={key}
              className={`calendar-day ${key < today ? "past" : ""} ${key === today ? "today" : ""}`}
            >
              <span className="day-number">{day}</span>
              <div className="day-clinics">
                {(byDay.get(key) ?? []).map((s) => {
                  const n = count(s.id);
                  const closed = s.status !== "AVAILABLE";
                  const status =
                    s.status === "HELD"
                      ? "Invitation pending"
                      : s.status === "BOOKED"
                        ? "Booked"
                        : `${n} eligible candidate${n === 1 ? "" : "s"}`;
                  const side =
                    weekday >= 4 ? "end" : weekday === 3 ? "middle" : "";
                  return (
                    <div className={`cal-clinic ${side}`} key={s.id}>
                      <button
                        className={`slot-num ${closed ? "dim" : ""} ${slot?.id === s.id ? "selected" : ""}`}
                        disabled={closed}
                        aria-pressed={slot?.id === s.id}
                        aria-label={`${s.service}, ${dateLabel(s.start)}: ${status}`}
                        onClick={() => setSelected(s.id)}
                      >
                        {closed ? "–" : n > 9 ? "9+" : n}
                      </button>
                      <div className="cal-pop slot-pop" role="tooltip">
                        <strong>{s.service}</strong>
                        <small>
                          {dateLabel(s.start)} · {s.provider}
                        </small>
                        <span>{status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {!open.length && (
          <p className="calendar-note">
            No available openings. Cancel a booking or create a slot.
          </p>
        )}
      </section>
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
                      <p>Waitlist priority #{i + 1}</p>
                    </div>
                    <span className="status active">Eligible</span>
                  </div>
                  <div className="priority-hint">
                    <span className="eyebrow">
                      PRIORITY HINT ·{" "}
                      {c.visitType === "FIRST"
                        ? "SELF-REPORTED, FIRST VISIT"
                        : "CLINIC-ASSESSED, FOLLOW-UP"}
                    </span>
                    <SeverityTags
                      tags={c.tags}
                      empty="No severity information recorded"
                    />
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
export function ClinicInbox({ state, act }: { state: AppState; act: Action }) {
  return !state.clinicNotifications.length ? (
    <Empty
      title="No notifications yet"
      body="You’ll be told here when a patient books one of your openings or declines a waitlist invitation."
    />
  ) : (
    <div className="stack">
      {state.clinicNotifications.map((n) => (
        <article
          className={`card notification ${n.read ? "" : "unread"}`}
          key={n.id}
        >
          <span className="clinic-symbol">
            <Bell />
          </span>
          <div className="grow">
            <span className="eyebrow">{dateLabel(n.createdAt)}</span>
            <h3>{n.title}</h3>
            <p>{n.body}</p>
            {!n.read && (
              <button
                className="text-button"
                onClick={() =>
                  void act({ type: "readClinic", notificationId: n.id })
                }
              >
                Mark as read
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
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
