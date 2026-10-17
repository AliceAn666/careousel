"use client";
import { useState } from "react";
import {
  Anchor,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  Leaf,
  MapPin,
  Mountain,
  Plus,
  ShieldCheck,
  Trees,
  type LucideIcon,
} from "lucide-react";
import type {
  Action,
  AppState,
  Booking,
  Waitlist,
  SlotView,
} from "@/lib/types";
import {
  dateLabel,
  money,
  PLANS,
  SERVICES,
  pacificDateBoundary,
  pacificDate,
  timeLabel,
} from "@/lib/config";
import { Status, Empty, Modal } from "./ui";
const CLINIC_ICONS: Record<string, LucideIcon> = {
  harbor: Anchor,
  cedar: Trees,
  summit: Mountain,
  willow: Leaf,
};
export function ClinicIcon({
  clinicId,
  size = 16,
}: {
  clinicId: string;
  size?: number;
}) {
  const Icon = CLINIC_ICONS[clinicId] ?? Heart;
  return <Icon size={size} aria-hidden="true" />;
}
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const monthKey = (key: string) => key.slice(0, 7);
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function monthDays(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    lead: first,
    days: Array.from({ length: count }, (_, i) => {
      const day = i + 1;
      return {
        day,
        weekday: (first + i) % 7,
        key: `${month}-${String(day).padStart(2, "0")}`,
      };
    }),
  };
}
export function SearchCare({
  state,
  onDetail,
  onWaitlist,
}: {
  state: AppState;
  onDetail: (s: SlotView) => void;
  onWaitlist: () => void;
}) {
  const [service, setService] = useState(""),
    [city, setCity] = useState(""),
    [plan, setPlan] = useState(""),
    [price, setPrice] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const today = pacificDate(new Date());
  const firstSlot = state.slots[0] ? pacificDate(state.slots[0].start) : today;
  const lastSlot = state.slots.length
    ? pacificDate(state.slots[state.slots.length - 1].start)
    : today;
  const [month, setMonth] = useState(monthKey(firstSlot));
  const filtering = !!(service || city || plan || price || from || to);
  // Inclusive Pacific date range; either end may be left open.
  const inRange = (key: string) => (!from || key >= from) && (!to || key <= to);
  const matches = (s: SlotView) =>
    (!service || s.service === service) &&
    (!city || s.clinic.city === city) &&
    (!plan || s.plans.includes(plan)) &&
    (!price || s.price <= Number(price) * 100) &&
    inRange(pacificDate(s.start));
  const matchCount = state.slots.filter(matches).length;
  // Group each day's openings by clinic so one icon represents one clinic.
  const byDay = new Map<string, Map<string, SlotView[]>>();
  for (const s of state.slots) {
    const key = pacificDate(s.start);
    const clinics = byDay.get(key) ?? new Map<string, SlotView[]>();
    clinics.set(s.clinicId, [...(clinics.get(s.clinicId) ?? []), s]);
    byDay.set(key, clinics);
  }
  const { lead, days } = monthDays(month);
  const monthTitle = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const clear = () => {
    setService("");
    setCity("");
    setPlan("");
    setPrice("");
    setFrom("");
    setTo("");
  };
  return (
    <>
      <section className="plan-card" aria-label="Your insurance">
        <ShieldCheck size={20} aria-hidden="true" />
        <span>
          Currently using <strong>{state.user?.plan}</strong> insurance
        </span>
        <span className="tiny">Demo plan · no real insurance checks</span>
      </section>
      <section className="filter-card">
        <label>
          Specialty
          <select
            aria-label="Specialty"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">All specialties</option>
            {SERVICES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Location
          <select
            aria-label="Location"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="">All locations</option>
            {[...new Set(state.clinics.map((c) => c.city))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Insurance
          <select
            aria-label="Insurance"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            <option value="">All demo plans</option>
            {PLANS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Maximum cost ($)
          <input
            type="number"
            min="0"
            value={price}
            placeholder="Any budget"
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          From date
          <input
            type="date"
            aria-label="From date"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              if (e.target.value) setMonth(monthKey(e.target.value));
            }}
          />
        </label>
        <label>
          To date
          <input
            type="date"
            aria-label="To date"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              if (e.target.value && !from) setMonth(monthKey(e.target.value));
            }}
          />
        </label>
      </section>
      <div className="section-title">
        <div>
          <h2>
            Available appointments{" "}
            <span className="result-count">
              {filtering
                ? `${matchCount} of ${state.slots.length} match`
                : state.slots.length}
            </span>
          </h2>
          <p>
            Hover or tap a clinic icon to see its open times, then choose a time
            to book.
          </p>
        </div>
        <div className="button-row">
          {filtering && (
            <button className="text-button" onClick={clear}>
              Clear filters
            </button>
          )}
          <button className="primary" onClick={onWaitlist}>
            <Plus size={16} />
            Join a waitlist
          </button>
        </div>
      </div>
      <section className="card care-calendar" aria-label="Appointment calendar">
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
            disabled={month >= monthKey(lastSlot)}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <ul className="clinic-legend" aria-label="Clinic icons">
          {state.clinics.map((c) => (
            <li key={c.id}>
              <span className={`cal-icon ${c.id}`}>
                <ClinicIcon clinicId={c.id} size={14} />
              </span>
              {c.name}
            </li>
          ))}
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
          {days.map(({ day, weekday, key }) => {
            const clinics = byDay.get(key);
            const dayMatches =
              !!clinics && [...clinics.values()].flat().some(matches);
            const classes = [
              "calendar-day",
              key < today ? "past" : "",
              key === today ? "today" : "",
              (from || to) && inRange(key) ? "in-range" : "",
              filtering && clinics && !dayMatches ? "dim" : "",
            ];
            return (
              <div className={classes.join(" ")} key={key}>
                <span className="day-number">{day}</span>
                {clinics && (
                  <div className="day-clinics">
                    {[...clinics.entries()].map(([clinicId, slots]) => {
                      const clinic = slots[0].clinic;
                      const hits = slots.filter(matches);
                      const dim = filtering && hits.length === 0;
                      const side =
                        weekday >= 4 ? "end" : weekday === 3 ? "middle" : "";
                      return (
                        <div className={`cal-clinic ${side}`} key={clinicId}>
                          <button
                            className={`cal-icon ${clinicId} ${dim ? "dim" : ""}`}
                            aria-label={`${clinic.name}: ${slots.length} opening${slots.length > 1 ? "s" : ""} on ${dateLabel(slots[0].start).split(",")[0]}${dim ? ", does not match filters" : ""}`}
                          >
                            <ClinicIcon clinicId={clinicId} />
                            {slots.length > 1 && <i>{slots.length}</i>}
                          </button>
                          <div
                            className="cal-pop"
                            role="group"
                            aria-label={`${clinic.name} openings`}
                          >
                            <strong>{clinic.name}</strong>
                            <small>
                              {clinic.city} · {clinic.address}
                            </small>
                            <ul>
                              {slots.map((s) => (
                                <li key={s.id}>
                                  <button
                                    className={
                                      matches(s) || !filtering ? "" : "dim"
                                    }
                                    onClick={() => onDetail(s)}
                                  >
                                    <b>{timeLabel(s.start)}</b>
                                    <span>
                                      {s.service} · {s.provider}
                                    </span>
                                    <span>{money(s.price)}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {firstSlot > lastSlot || !state.slots.length ? (
          <Empty
            title="No openings just yet"
            body="Join the waitlist and we’ll watch for a suitable opening."
          />
        ) : (
          filtering &&
          matchCount === 0 && (
            <p className="calendar-note">
              No openings match these filters. Try adjusting them, or join the
              waitlist.
            </p>
          )
        )}
      </section>
    </>
  );
}
export function Appointments({
  state,
  act,
  onWaitlist,
}: {
  state: AppState;
  act: Action;
  onWaitlist: (w?: Waitlist) => void;
}) {
  return (
    <>
      <div className="insight-row">
        <div className="card insight">
          <CalendarDays />
          <div>
            <span>Upcoming appointments</span>
            <strong>
              {state.bookings.filter((b) => b.status === "CONFIRMED").length}
            </strong>
          </div>
        </div>
        <div className="card insight">
          <Clock3 />
          <div>
            <span>Active waitlist requests</span>
            <strong>
              {state.waitlists.filter((w) => w.status === "ACTIVE").length}
            </strong>
          </div>
        </div>
      </div>
      <div className="section-title">
        <h2>Your care calendar</h2>
        <span className="muted">Pacific time</span>
      </div>
      {!state.bookings.length ? (
        <Empty
          title="Your calendar is ready"
          body="Find care to book your first appointment."
        />
      ) : (
        <div className="stack">
          {state.bookings.map((b) => (
            <article key={b.id} className="card booking-card">
              <span className={`clinic-symbol ${b.slot.clinicId}`}>
                <ClinicIcon clinicId={b.slot.clinicId} size={22} />
              </span>
              <div className="grow">
                <span className="eyebrow">{b.slot.service}</span>
                <h3>{b.slot.clinic.name}</h3>
                <p>
                  {dateLabel(b.slot.start)} · {b.slot.provider}
                </p>
                <p className="muted">
                  <MapPin size={14} />
                  {b.slot.clinic.address}, {b.slot.clinic.city}
                </p>
              </div>
              <div className="card-actions">
                <Status value={b.status} />
                {b.status === "CONFIRMED" && (
                  <button
                    className="text-button"
                    onClick={() => {
                      if (
                        confirm(
                          "Cancel this appointment? Any linked waitlist will be withdrawn.",
                        )
                      )
                        void act({ type: "cancel", bookingId: b.id });
                    }}
                  >
                    Cancel appointment
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="section-title">
        <h2>Your requests</h2>
        <button className="primary" onClick={() => onWaitlist()}>
          <Plus size={17} />
          Join a waitlist
        </button>
      </div>
      {state.waitlists.length === 0 ? (
        <Empty
          title="Your next opportunity starts here"
          body="Join a waitlist to hear about appointments that fit your preferences."
        />
      ) : (
        <div className="stack">
          {state.waitlists.map((w) => (
            <article className="card request-card" key={w.id}>
              <div>
                <span className="eyebrow">EARLIER CARE REQUEST</span>
                <h3>{w.service}</h3>
                <p>
                  {w.city || "All participating locations"} · Up to{" "}
                  {money(w.maxPrice)} · {w.plan}
                </p>
                <p>
                  {dateLabel(w.earliest)} — {dateLabel(w.latest)}
                </p>
                <p>
                  {w.startHour}:00–{w.endHour}:00 Pacific ·{" "}
                  {w.bookingId
                    ? "Original booking protected"
                    : "No linked appointment"}
                </p>
              </div>
              <div className="card-actions">
                <Status value={w.status} />
                {w.status === "ACTIVE" && (
                  <>
                    <button className="secondary" onClick={() => onWaitlist(w)}>
                      Edit preferences
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (
                          confirm(
                            "Withdraw this waitlist request? Your original booking will remain.",
                          )
                        )
                          void act({ type: "withdraw", waitlistId: w.id });
                      }}
                    >
                      Withdraw
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function WaitlistForm({
  state,
  booking,
  existing,
  act,
  onClose,
  onSaved,
}: {
  state: AppState;
  booking: Booking | null;
  existing: Waitlist | null;
  act: Action;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [days, setDays] = useState(existing?.weekdays ?? [0, 1, 2, 3, 4, 5, 6]),
    [saving, setSaving] = useState(false);
  const [clinicIds, setClinicIds] = useState(existing?.clinicIds ?? []);
  const [service, setService] = useState(
    existing?.service ?? booking?.slot.service ?? "Dermatology",
  );
  const [openedAt] = useState(() => Date.now());
  const inputDate = pacificDate;
  return (
    <Modal
      title={
        existing
          ? "Edit waitlist preferences"
          : "Let’s find you an earlier opening"
      }
      onClose={onClose}
    >
      <p className="muted">
        {booking || existing?.bookingId
          ? "Your original appointment stays confirmed until you accept an earlier offer."
          : "Choose your preferences. A clinic will review each match before inviting you."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const f = new FormData(e.currentTarget);
          const success = await act({
            type: "waitlist",
            waitlistId: existing?.id,
            bookingId: booking?.id ?? existing?.bookingId ?? undefined,
            service,
            plan: f.get("plan"),
            city: f.get("city"),
            clinicIds,
            maxPrice: Math.round(Number(f.get("maxPrice")) * 100),
            earliest: pacificDateBoundary(String(f.get("earliest"))),
            latest: pacificDateBoundary(String(f.get("latest")), true),
            startHour: Number(f.get("startHour")),
            endHour: Number(f.get("endHour")),
            weekdays: days,
          });
          setSaving(false);
          if (success) onSaved();
        }}
      >
        <div className="form-grid">
          <label>
            Specialty
            <select
              value={service}
              disabled={!!booking || !!existing}
              onChange={(e) => setService(e.target.value)}
            >
              {SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Demo insurance
            <select
              name="plan"
              defaultValue={existing?.plan ?? state.user?.plan}
            >
              {PLANS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Location
            <select name="city" defaultValue={existing?.city ?? ""}>
              <option value="">All locations</option>
              {[...new Set(state.clinics.map((c) => c.city))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Maximum estimated cost ($)
            <input
              name="maxPrice"
              type="number"
              min="0"
              max="10000"
              required
              defaultValue={(existing?.maxPrice ?? 20000) / 100}
            />
          </label>
          <label>
            From date
            <input
              type="date"
              name="earliest"
              required
              defaultValue={
                existing
                  ? inputDate(existing.earliest)
                  : inputDate(new Date().toISOString())
              }
            />
          </label>
          <label>
            Through date
            <input
              type="date"
              name="latest"
              required
              defaultValue={
                existing
                  ? inputDate(existing.latest)
                  : inputDate(new Date(openedAt + 35 * 86400000).toISOString())
              }
            />
          </label>
          <label>
            Earliest hour (Pacific)
            <input
              type="number"
              min="0"
              max="23"
              name="startHour"
              required
              defaultValue={existing?.startHour ?? 8}
            />
          </label>
          <label>
            Latest hour (Pacific)
            <input
              type="number"
              min="1"
              max="24"
              name="endHour"
              required
              defaultValue={existing?.endHour ?? 18}
            />
          </label>
        </div>
        <fieldset>
          <legend>Preferred weekdays</legend>
          <div className="check-row">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <label key={d}>
                <input
                  type="checkbox"
                  checked={days.includes(i)}
                  onChange={(e) =>
                    setDays(
                      e.target.checked
                        ? [...days, i]
                        : days.filter((x) => x !== i),
                    )
                  }
                />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            Participating clinics{" "}
            <span className="muted">(none selected = all)</span>
          </legend>
          <div className="check-row">
            {state.clinics.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={clinicIds.includes(c.id)}
                  onChange={(e) =>
                    setClinicIds(
                      e.target.checked
                        ? [...clinicIds, c.id]
                        : clinicIds.filter((x) => x !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="demo-note">
          <ShieldCheck size={18} />
          Accepting an earlier offer will replace your linked original
          appointment. Travel buffers are not checked.
        </div>
        <button className="primary full" disabled={saving || !days.length}>
          {saving ? "Saving…" : existing ? "Save preferences" : "Join waitlist"}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
export function Inbox({ state, act }: { state: AppState; act: Action }) {
  return (
    <>
      {!state.notifications.length ? (
        <Empty
          title="A little quiet, for now"
          body="When a clinic approves a suitable opening, your invitation will appear here."
        />
      ) : (
        <div className="stack">
          {state.notifications.map((n) => {
            const offer = state.offers.find((o) => o.id === n.offerId);
            return (
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
                  {offer && (
                    <div className="offer-box">
                      <strong>
                        {offer.slot.clinic.name} · {offer.slot.service}
                      </strong>
                      <p>
                        {dateLabel(offer.slot.start)} ·{" "}
                        {money(offer.slot.price)} estimated
                      </p>
                      <Status value={offer.status} />
                      {offer.status === "PENDING" && (
                        <>
                          <p>
                            Respond by {dateLabel(offer.expiresAt)}. Accepting
                            replaces your linked original appointment.
                          </p>
                          <div className="button-row">
                            <button
                              className="primary"
                              onClick={() => {
                                if (
                                  confirm(
                                    "Confirm this earlier appointment and replace your linked original booking?",
                                  )
                                )
                                  void act({
                                    type: "respond",
                                    offerId: offer.id,
                                    accept: true,
                                  });
                              }}
                            >
                              <Check size={16} />
                              Accept earlier appointment
                            </button>
                            <button
                              className="secondary"
                              onClick={() =>
                                void act({
                                  type: "respond",
                                  offerId: offer.id,
                                  accept: false,
                                })
                              }
                            >
                              Decline
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {!n.read && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void act({ type: "read", notificationId: n.id })
                      }
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
