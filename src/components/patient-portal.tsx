"use client";
import { priorityLabel } from "@/lib/waitlist-priority";
import { useEffect, useState } from "react";
import {
  Anchor,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
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
import { CoverageSummary } from "./coverage-summary";
import { demoCoverage, type PlanType } from "@/lib/demo-coverage";
import {
  readSearchPreferences,
  saveSearchPreferences,
  defaultSearchPreferences,
  type SearchPreferences,
} from "@/lib/search-preferences";
import onboarding from "./onboarding.module.css";
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
export function SearchCare({
  state,
  onDetail,
  onWaitlist,
}: {
  state: AppState;
  onDetail: (
    s: SlotView,
    selection: { provider: string; planType: PlanType },
  ) => void;
  onWaitlist: (service?: string) => void;
}) {
  const [preferences, setPreferences] = useState(() =>
    readSearchPreferences(state.user?.id ?? "guest"),
  );
  const {
    service,
    city,
    plan,
    price,
    date,
    planType,
    coveredOnly,
    patientCost,
  } = preferences;
  const update = (patch: Partial<SearchPreferences>) =>
    setPreferences((current) => ({ ...current, ...patch }));
  const setService = (service: SearchPreferences["service"]) =>
    update({ service });
  const setCity = (city: string) => update({ city });
  const setPlan = (plan: SearchPreferences["plan"]) =>
    update({
      plan,
      coveredOnly: plan && plan !== "Self-pay" ? coveredOnly : false,
      patientCost: plan ? patientCost : "",
    });
  const setPrice = (price: string) => update({ price });
  const setDate = (date: string) => update({ date });
  useEffect(() => {
    if (state.user) saveSearchPreferences(state.user.id, preferences);
  }, [preferences, state.user]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const filtering = !!(
    query ||
    category ||
    service ||
    city ||
    plan ||
    price ||
    date ||
    coveredOnly ||
    patientCost
  );
  const matches = (s: SlotView) => {
    const benefit = demoCoverage(s, plan, planType);
    return (
      (!query ||
        `${s.service} ${s.service === "Primary care" ? "Routine Checkups" : ["Cardiology", "Dermatology"].includes(s.service) ? "Specialist Visits" : ""} ${s.clinic.name} ${s.provider}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())) &&
      (!category ||
        (category === "Specialist Visits"
          ? ["Dermatology", "Cardiology"].includes(s.service)
          : s.service === category)) &&
      (!service || s.service === service) &&
      (!city || s.clinic.city === city) &&
      (!plan || s.plans.includes(plan)) &&
      (!price || s.price <= Number(price) * 100) &&
      (!date || pacificDate(s.start) === date) &&
      (!coveredOnly ||
        (!!plan && plan !== "Self-pay" && benefit.estimate !== null)) &&
      (!patientCost ||
        (benefit.estimate !== null &&
          benefit.estimate <= Number(patientCost) * 100))
    );
  };
  const results = state.slots
    .filter(matches)
    .sort(
      (a, b) =>
        +new Date(a.start) - +new Date(b.start) || a.id.localeCompare(b.id),
    );
  const matchCount = results.length;
  const clear = () => {
    setPreferences({ ...defaultSearchPreferences });
    setQuery("");
    setCategory("");
  };
  return (
    <>
      <section className="card search-intro" aria-label="Appointment search">
        <h2>Book an appointment</h2>
        <p>
          Search participating clinics. Earliest matching openings appear first.
        </p>
        <label className="field">
          Medical service or specialty
          <input
            type="search"
            placeholder="Search service, clinic or specialist"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="button-row" aria-label="Service categories">
          {[
            ["Vaccinations", "Vaccinations"],
            ["Blood Tests", "Blood Tests"],
            ["Routine Checkups", "Primary care"],
            ["Specialist Visits", "Specialist Visits"],
          ].map(([label, value]) => (
            <button
              key={label}
              className="secondary"
              aria-pressed={category === value}
              onClick={() => setCategory(category === value ? "" : value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted">
          Synthetic openings only. Some categories may currently have no
          participating appointments.
        </p>
        <button
          className="text-button"
          onClick={() =>
            onWaitlist(
              service ||
                (category !== "Specialist Visits" ? category : "") ||
                undefined,
            )
          }
        >
          Find an earlier appointment · Join a waitlist
        </button>
      </section>
      <section className="filter-card">
        <label>
          Specialty
          <select
            aria-label="Specialty"
            value={service}
            onChange={(e) =>
              setService(e.target.value as SearchPreferences["service"])
            }
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
            onChange={(e) =>
              setPlan(e.target.value as SearchPreferences["plan"])
            }
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
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
        </label>
      </section>
      <details
        open={!!plan}
        className={onboarding.benefits}
        aria-label="Fictional insurance comparison"
      >
        <summary>Compare fictional PPO / HMO estimates (optional)</summary>
        <p>
          Compare synthetic plan scenarios, not verified coverage. Your saved
          patient plan is {state.user?.plan}; browsing another insurer does not
          change it. Maximum cost above is the full listed visit price.
        </p>
        <div className={onboarding.fields}>
          <label>
            Plan type
            <select
              aria-label="Plan type"
              value={planType}
              onChange={(e) => update({ planType: e.target.value as PlanType })}
              disabled={!plan || plan === "Self-pay"}
            >
              <option value="PPO">PPO · demo</option>
              <option value="HMO">HMO · demo</option>
            </select>
          </label>
          <label className={onboarding.check}>
            <input
              type="checkbox"
              checked={coveredOnly}
              disabled={!plan || plan === "Self-pay"}
              onChange={(e) => update({ coveredOnly: e.target.checked })}
            />
            Show only in-network demo scenarios
          </label>
          <label>
            Maximum estimated patient cost ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={patientCost}
              disabled={!plan}
              onChange={(e) => update({ patientCost: e.target.value })}
            />
          </label>
        </div>
        <p>
          HMO examples use a narrower fictional network and exclude Cardiology.
          PPO examples use a fictional remaining deductible plus coinsurance.
          Select an opening for the calculation; unknown costs are never shown
          as $0.
        </p>
      </details>
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
            Earliest matching appointment first · Pacific time. View details
            before confirming.
          </p>
        </div>
        <div className="button-row">
          {filtering && (
            <button className="text-button" onClick={clear}>
              Clear filters
            </button>
          )}
          <button
            className="primary"
            onClick={() =>
              onWaitlist(
                service ||
                  (category !== "Specialist Visits" ? category : "") ||
                  undefined,
              )
            }
          >
            <Plus size={16} />
            Join a waitlist
          </button>
        </div>
      </div>
      <section
        className="stack appointment-results"
        aria-label="Appointment results"
        aria-live="polite"
      >
        {!results.length ? (
          <Empty
            title="No openings match these filters."
            body="Adjust your filters or join a waitlist. Your existing appointment stays protected."
          />
        ) : (
          results.map((s) => (
            <article className="card search-result" key={s.id}>
              <div className="grow">
                <span className="eyebrow">{s.service}</span>
                <h3>{s.clinic.name}</h3>
                <p>
                  {s.clinic.address}, {s.clinic.city}
                </p>
                <p>
                  <strong>{dateLabel(s.start)}</strong> · {s.provider}
                </p>
                <p>
                  {money(s.price)} estimated listed price · Fictional plans:{" "}
                  {s.plans.join(", ")}
                </p>
                {plan && (
                  <CoverageSummary
                    slot={s}
                    provider={plan}
                    planType={planType}
                  />
                )}
              </div>
              <button
                className="primary"
                data-slot-id={s.id}
                onClick={() => onDetail(s, { provider: plan, planType })}
              >
                View details &amp; book
              </button>
            </article>
          ))
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
              <div>
                <strong>Clinic-reviewed request priority</strong>
                {!w.priorities.length ? (
                  <p>Awaiting staff review</p>
                ) : (
                  w.priorities.map((priority) => (
                    <p key={priority.id}>
                      {priority.clinic.name}: {priorityLabel(priority.level)}
                      {priority.assignedBy && (
                        <> · Approved by {priority.assignedBy.name}</>
                      )}
                    </p>
                  ))
                )}
                <small>
                  Each clinic reviews this request separately. This is not a
                  permanent patient classification. Editing preferences requires
                  a new staff review.
                </small>
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
  initialService,
  state,
  booking,
  existing,
  act,
  onClose,
  onSaved,
}: {
  initialService?: string;
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
    existing?.service ??
      booking?.slot.service ??
      initialService ??
      "Dermatology",
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
            bookingId: String(f.get("bookingId") || "") || undefined,
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
        <label className="field">
          Existing appointment to replace (optional)
          <select
            name="bookingId"
            key={service}
            defaultValue={existing?.bookingId ?? booking?.id ?? ""}
          >
            <option value="">No linked appointment</option>
            {state.bookings
              .filter(
                (b) => b.status === "CONFIRMED" && b.slot.service === service,
              )
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.slot.clinic.name} · {dateLabel(b.slot.start)}
                </option>
              ))}
          </select>
          <small>
            A linked appointment stays confirmed until an earlier replacement
            succeeds. Unlinked requests do not replace it.
          </small>
        </label>

        <div className="form-grid">
          <label>
            Specialty
            <select
              aria-label="Specialty"
              value={service}
              disabled={!!booking || !!existing}
              onChange={(e) =>
                setService(e.target.value as SearchPreferences["service"])
              }
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
                      <p>
                        Referral:{" "}
                        {offer.slot.requiresReferral
                          ? "required; clinic-reviewed"
                          : "not required for this opening"}
                        . Authorization:{" "}
                        {offer.slot.requiresAuthorization
                          ? "required; clinic-reviewed"
                          : "not required for this opening"}
                        . Your saved fictional plan and scheduling restrictions
                        are checked again before confirmation.
                      </p>
                      {offer.groupId && (
                        <p>
                          Competitive invitation: other eligible patients may
                          also receive this opening. Only the first successfully
                          committed booking confirms it. Your original booking
                          stays confirmed until replacement succeeds.
                          Eligibility: {offer.slot.service}, saved demo plan and
                          waitlist restrictions are rechecked on acceptance.
                        </p>
                      )}
                      {offer.status === "REVOKED" && (
                        <p>
                          This opening was filled, withdrawn, or your
                          eligibility changed. Your original appointment is
                          unchanged unless you already successfully replaced it.
                        </p>
                      )}
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
