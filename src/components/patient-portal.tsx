"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  ShieldCheck,
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
} from "@/lib/config";
import { CoverageSummary } from "./coverage-summary";
import { demoCoverage, type PlanType } from "@/lib/demo-coverage";
import { Status, Empty, Modal } from "./ui";
export function SearchCare({
  state,
  onDetail,
  onWaitlist,
}: {
  state: AppState;
  onDetail: (
    s: SlotView,
    coverage?: { provider: string; planType: PlanType },
  ) => void;
  onWaitlist: () => void;
}) {
  const [service, setService] = useState(""),
    [city, setCity] = useState(""),
    [plan, setPlan] = useState(""),
    [price, setPrice] = useState(""),
    [date, setDate] = useState("");
  const [planType, setPlanType] = useState<PlanType>("PPO");
  const [coveredOnly, setCoveredOnly] = useState(false);
  const results = state.slots.filter(
    (s) =>
      (!service || s.service === service) &&
      (!city || s.clinic.city === city) &&
      (!plan || s.plans.includes(plan)) &&
      (!coveredOnly ||
        (plan !== "" &&
          plan !== "Self-pay" &&
          demoCoverage(s, plan, planType).estimate !== null)) &&
      (!price || s.price <= Number(price) * 100) &&
      (!date ||
        new Intl.DateTimeFormat("en-CA", {
          timeZone: s.clinic.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(s.start)) === date),
  );
  return (
    <>
      <section className="hero">
        <div>
          <span className="pill">
            <span className="live-dot" />
            CARE THAT FITS YOUR LIFE
          </span>
          <h2>
            Your next chapter
            <br />
            shouldn’t have to wait.
          </h2>
          <p>
            Explore appointments across trusted local clinics.
            <br />
            Find a time that works for you.
          </p>
          <button className="hero-link" onClick={onWaitlist}>
            Looking for something sooner? Join a waitlist{" "}
            <ArrowUpRight size={18} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-cross">✚</div>
          <div className="floating-card">
            <CheckCircle2 />
            <span>
              Earlier care.
              <br />
              <strong>More possibilities.</strong>
            </span>
          </div>
          <span className="art-star">✳</span>
        </div>
      </section>
      <section className="filter-card" data-tour="filters">
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
          Appointment date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </section>
      <section className="coverage-controls" data-tour="benefits">
        <div>
          <h3>Find care covered by your plan</h3>
          <p>
            Explore fictional plan-specific benefits. Search does not change
            your saved demo insurance or booking eligibility.
          </p>
        </div>
        <label>
          Plan type
          <select
            aria-label="Plan type"
            value={planType}
            disabled={plan === "Self-pay"}
            onChange={(e) => setPlanType(e.target.value as PlanType)}
          >
            <option>PPO</option>
            <option>HMO</option>
          </select>
        </label>
        <label className="coverage-toggle">
          <input
            type="checkbox"
            checked={coveredOnly}
            onChange={(e) => setCoveredOnly(e.target.checked)}
          />{" "}
          Only show covered demo scenarios
        </label>
        <small>
          All insurers, networks and benefit amounts are fictional. Maximum cost
          filters the full listed visit price, not estimated patient cost.
          Results are sorted by earliest appointment.
        </small>
      </section>
      <div className="section-title">
        <div>
          <h2>
            Available appointments{" "}
            <span className="result-count">{results.length}</span>
          </h2>
          <p>Real-time openings. A fresh start for your schedule.</p>
        </div>
        <button
          className="text-button"
          onClick={() => {
            setService("");
            setCity("");
            setPlan("");
            setPrice("");
            setDate("");
            setPlanType("PPO");
            setCoveredOnly(false);
          }}
        >
          Clear filters
        </button>
      </div>
      {!results.length ? (
        <Empty
          title="No openings match just yet"
          body="Try adjusting your filters, or join the waitlist for a suitable opening."
        />
      ) : (
        <div className="appointment-grid">
          {[...results]
            .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
            .map((s) => (
              <article key={s.id} className="card appointment-card">
                <div className="clinic-card-top">
                  <span className={`clinic-symbol ${s.clinicId}`}>
                    <Heart size={22} />
                  </span>
                  <span className="availability">
                    <span className="live-dot" />
                    Available
                  </span>
                </div>
                <span className="eyebrow">{s.service}</span>
                <h3>{s.clinic.name}</h3>
                <p className="muted">
                  <MapPin size={14} />
                  {s.clinic.city} · {s.clinic.address}
                </p>
                <div className="slot-time">
                  <CalendarDays size={17} />
                  <strong>{dateLabel(s.start)}</strong>
                </div>
                <p>{s.provider} · 30-minute visit</p>
                <CoverageSummary slot={s} provider={plan} planType={planType} />
                <div className="card-bottom">
                  <div>
                    <strong className="price">{money(s.price)}</strong>
                    <span className="tiny"> estimated · demo insurance</span>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => onDetail(s, { provider: plan, planType })}
                  >
                    View & book <ChevronRight size={16} />
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
      <div className="waitlist-banner">
        <span className="avatar mint">
          <Clock3 />
        </span>
        <div>
          <h3>A sooner appointment could be around the corner.</h3>
          <p>
            Keep your booking. We’ll watch for openings that fit your
            preferences.
          </p>
        </div>
        <button className="primary" onClick={onWaitlist}>
          Join the waitlist <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
export function Appointments({
  state,
  act,
  join,
}: {
  state: AppState;
  act: Action;
  join: (b?: Booking) => void;
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
          <ShieldCheck />
          <div>
            <span>Your booking stays safe</span>
            <strong className="small">Until you accept an earlier offer</strong>
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
              <span className="clinic-symbol">
                <CalendarDays />
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
                  <>
                    <button className="secondary" onClick={() => join(b)}>
                      <Clock3 size={16} />
                      Find an earlier time
                    </button>
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
