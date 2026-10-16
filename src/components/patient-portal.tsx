"use client";
import { useI18n } from "./language-provider";
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
  money,
  PLANS,
  SERVICES,
  pacificDateBoundary,
  pacificDate,
} from "@/lib/config";
import { Status, Empty, Modal } from "./ui";
export function SearchCare({
  state,
  onDetail,
  onWaitlist,
}: {
  state: AppState;
  onDetail: (s: SlotView) => void;
  onWaitlist: () => void;
}) {
  const { t, dateLabel } = useI18n();
  const [service, setService] = useState(""),
    [city, setCity] = useState(""),
    [plan, setPlan] = useState(""),
    [price, setPrice] = useState(""),
    [date, setDate] = useState("");
  const results = state.slots.filter(
    (s) =>
      (!service || s.service === service) &&
      (!city || s.clinic.city === city) &&
      (!plan || s.plans.includes(plan)) &&
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
            {t(" CARE THAT FITS YOUR LIFE ")}
          </span>
          <h2>
            {t(" Your next chapter ")}
            <br />
            {t(" shouldn’t have to wait. ")}
          </h2>
          <p>
            {t(" Explore appointments across trusted local clinics. ")}
            <br />
            {t(" Find a time that works for you. ")}
          </p>
          <button className="hero-link" onClick={onWaitlist}>
            {t(" Looking for something sooner? Join a waitlist")}{" "}
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
              {t(" Earlier care. ")}
              <br />
              <strong>{t("More possibilities.")}</strong>
            </span>
          </div>
          <span className="art-star">✳</span>
        </div>
      </section>
      <section className="filter-card">
        <label>
          {t(" Specialty ")}
          <select
            aria-label={t("Specialty")}
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">{t("All specialties")}</option>
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(" Location ")}
          <select
            aria-label={t("Location")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="">{t("All locations")}</option>
            {[...new Set(state.clinics.map((c) => c.city))].map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(" Insurance ")}
          <select
            aria-label={t("Insurance")}
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            <option value="">{t("All demo plans")}</option>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {t(p)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t(" Maximum cost ($) ")}
          <input
            type="number"
            min="0"
            value={price}
            placeholder={t("Any budget")}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          {t(" Appointment date ")}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </section>
      <div className="section-title">
        <div>
          <h2>
            {t(" Available appointments")}{" "}
            <span className="result-count">{results.length}</span>
          </h2>
          <p>{t("Real-time openings. A fresh start for your schedule.")}</p>
        </div>
        <button
          className="text-button"
          onClick={() => {
            setService("");
            setCity("");
            setPlan("");
            setPrice("");
            setDate("");
          }}
        >
          {t(" Clear filters ")}
        </button>
      </div>
      {!results.length ? (
        <Empty
          title={t("No openings match just yet")}
          body={t(
            "Try adjusting your filters, or join the waitlist for a suitable opening.",
          )}
        />
      ) : (
        <div className="appointment-grid">
          {results.map((s) => (
            <article key={s.id} className="card appointment-card">
              <div className="clinic-card-top">
                <span className={`clinic-symbol ${s.clinicId}`}>
                  <Heart size={22} />
                </span>
                <span className="availability">
                  <span className="live-dot" />
                  {t(" Available ")}
                </span>
              </div>
              <span className="eyebrow">{t(s.service)}</span>
              <h3>{s.clinic.name}</h3>
              <p className="muted">
                <MapPin size={14} />
                {s.clinic.city} · {s.clinic.address}
              </p>
              <div className="slot-time">
                <CalendarDays size={17} />
                <strong>{dateLabel(s.start)}</strong>
              </div>
              <p>
                {t(s.provider)} ·{" "}
                {Math.round((+new Date(s.end) - +new Date(s.start)) / 60000)}
                {t(" minute visit")}
              </p>
              <div className="card-bottom">
                <div>
                  <strong className="price">{money(s.price)}</strong>
                  <span className="tiny">
                    {t(" estimated · demo insurance")}
                  </span>
                </div>
                <button className="secondary" onClick={() => onDetail(s)}>
                  {t(" View & book ")}
                  <ChevronRight size={16} />
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
          <h3>{t("A sooner appointment could be around the corner.")}</h3>
          <p>
            {t(
              " Keep your booking. We’ll watch for openings that fit your preferences. ",
            )}
          </p>
        </div>
        <button className="primary" onClick={onWaitlist}>
          {t(" Join the waitlist ")}
          <ArrowRight size={16} />
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
  const { t, dateLabel } = useI18n();
  return (
    <>
      <div className="insight-row">
        <div className="card insight">
          <CalendarDays />
          <div>
            <span>{t("Upcoming appointments")}</span>
            <strong>
              {state.bookings.filter((b) => b.status === "CONFIRMED").length}
            </strong>
          </div>
        </div>
        <div className="card insight">
          <ShieldCheck />
          <div>
            <span>{t("Your booking stays safe")}</span>
            <strong className="small">
              {t("Until you accept an earlier offer")}
            </strong>
          </div>
        </div>
      </div>
      <div className="section-title">
        <h2>{t("Your care calendar")}</h2>
        <span className="muted">{t("Pacific time")}</span>
      </div>
      {!state.bookings.length ? (
        <Empty
          title={t("Your calendar is ready")}
          body={t("Find care to book your first appointment.")}
        />
      ) : (
        <div className="stack">
          {state.bookings.map((b) => (
            <article key={b.id} className="card booking-card">
              <span className="clinic-symbol">
                <CalendarDays />
              </span>
              <div className="grow">
                <span className="eyebrow">{t(b.slot.service)}</span>
                <h3>{b.slot.clinic.name}</h3>
                <p>
                  {dateLabel(b.slot.start)} · {t(b.slot.provider)}
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
                      {t(" Find an earlier time ")}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (
                          confirm(
                            t(
                              "Cancel this appointment? Any linked waitlist will be withdrawn.",
                            ),
                          )
                        )
                          void act({ type: "cancel", bookingId: b.id });
                      }}
                    >
                      {t(" Cancel appointment ")}
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
  const { t } = useI18n();
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
          ? t("Edit waitlist preferences")
          : t("Let’s find you an earlier opening")
      }
      onClose={onClose}
    >
      <p className="muted">
        {booking || existing?.bookingId
          ? t(
              "Your original appointment stays confirmed until you accept an earlier offer.",
            )
          : t(
              "Choose your preferences. A clinic will review each match before inviting you.",
            )}
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
            {t(" Specialty ")}
            <select
              value={service}
              disabled={!!booking || !!existing}
              onChange={(e) => setService(e.target.value)}
            >
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {t(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t(" Demo insurance ")}
            <select
              name="plan"
              defaultValue={existing?.plan ?? state.user?.plan}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {t(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t(" Location ")}
            <select name="city" defaultValue={existing?.city ?? ""}>
              <option value="">{t("All locations")}</option>
              {[...new Set(state.clinics.map((c) => c.city))].map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t(" Maximum estimated cost ($) ")}
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
            {t(" From date ")}
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
            {t(" Through date ")}
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
            {t(" Earliest hour (Pacific) ")}
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
            {t(" Latest hour (Pacific) ")}
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
          <legend>{t("Preferred weekdays")}</legend>
          <div className="check-row">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <label key={t(d)}>
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
                {t(d)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>
            {t(" Participating clinics")}{" "}
            <span className="muted">{t("(none selected = all)")}</span>
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
          {t(
            " Accepting an earlier offer will replace your linked original appointment. Travel buffers are not checked. ",
          )}
        </div>
        <button className="primary full" disabled={saving || !days.length}>
          {saving
            ? t("Saving…")
            : existing
              ? t("Save preferences")
              : t("Join waitlist")}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
export function Inbox({ state, act }: { state: AppState; act: Action }) {
  const { t, dateLabel } = useI18n();
  return (
    <>
      {!state.notifications.length ? (
        <Empty
          title={t("A little quiet, for now")}
          body={t(
            "When a clinic approves a suitable opening, your invitation will appear here.",
          )}
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
                  <h3>{t(n.title)}</h3>
                  <p>{t(n.body)}</p>
                  {offer && (
                    <div className="offer-box">
                      <strong>
                        {offer.slot.clinic.name} · {t(offer.slot.service)}
                      </strong>
                      <p>
                        {dateLabel(offer.slot.start)} ·{" "}
                        {money(offer.slot.price)}
                        {t(" estimated ")}
                      </p>
                      <Status value={offer.status} />
                      {offer.batchId && (
                        <p className="demo-note">
                          {t(
                            "Group invitation: other approved patients may receive this opening too. Only the first eligible confirmation succeeds. If another patient confirms, your original booking is unchanged.",
                          )}
                        </p>
                      )}
                      {offer.status === "PENDING" && (
                        <>
                          <p>
                            {t(" Respond by ")}
                            {dateLabel(offer.expiresAt)}
                            {t(
                              ". Accepting replaces your linked original appointment. ",
                            )}
                          </p>
                          <div className="button-row">
                            <button
                              className="primary"
                              onClick={() => {
                                if (
                                  confirm(
                                    t(
                                      "Confirm this earlier appointment and replace your linked original booking?",
                                    ),
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
                              {t(" Accept earlier appointment ")}
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
                              {t(" Decline ")}
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
                      {t(" Mark as read ")}
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
