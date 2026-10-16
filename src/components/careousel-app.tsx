"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Heart,
  LayoutDashboard,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type {
  Action,
  AppState,
  Booking,
  Waitlist,
  SlotView,
} from "@/lib/types";
import { dateLabel, money } from "@/lib/config";
import { request } from "@/lib/api";
import { FeedbackContext, Status, Empty, Modal } from "./ui";
import {
  SearchCare,
  Appointments,
  WaitlistForm,
  Inbox,
} from "./patient-portal";
import { ClinicSchedule, Matches, ActivityFeed } from "./clinic-portal";
import { DemoGuide } from "./demo-guide";
import { LandingPage } from "./landing-page";
const navPatient = [
  ["/search", "Find care", Search],
  ["/appointments", "My appointments", CalendarDays],
  ["/waitlists", "My waitlist", Clock3],
  ["/notifications", "Notifications", Bell],
  ["/demo", "Demo guide", Sparkles],
] as const;
const navClinic = [
  ["/clinic/schedule", "Schedule", LayoutDashboard],
  ["/clinic/waitlists", "Waitlist matches", Users],
  ["/clinic/activity", "Activity", Activity],
  ["/demo", "Demo guide", Sparkles],
] as const;
export function CareouselApp() {
  const [state, setState] = useState<AppState | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null),
    [waitlist, setWaitlist] = useState<Waitlist | null>(null),
    [showWaitlist, setShowWaitlist] = useState(false),
    [detail, setDetail] = useState<SlotView | null>(null);
  const path = usePathname(),
    router = useRouter();
  const load = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setState(data);
  }, []);
  useEffect(() => {
    let mounted = true;
    const refresh = () =>
      load().catch((e) => {
        if (mounted) setError(e.message);
      });
    void refresh();
    const timer = setInterval(refresh, 12000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [load]);
  async function selectPersona(id: string) {
    setNotice("");
    setBusy(true);
    setError("");
    try {
      await request("/api/session", { id });
      await load();
      router.push(id.startsWith("staff-") ? "/clinic/schedule" : "/search");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const act: Action = async (data) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request("/api/actions", data);
      await load();
      setNotice(result.message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  };
  function join(b?: Booking, w?: Waitlist) {
    setBooking(b ?? null);
    setWaitlist(w ?? null);
    setShowWaitlist(true);
  }
  if (path === "/" || (state && !state.user))
    return (
      <LandingPage
        personas={state?.personas ?? []}
        loading={!state && !error}
        busy={busy}
        error={error}
        onRetry={() => {
          setError("");
          void load().catch((e) => setError(e.message));
        }}
        onSelectPersona={(id) => void selectPersona(id)}
        onEnter={(role) => {
          if (state?.user?.role === role) {
            router.push(role === "STAFF" ? "/clinic/schedule" : "/search");
          } else {
            void selectPersona(role === "STAFF" ? "staff-cedar" : "avery");
          }
        }}
      />
    );
  if (!state)
    return (
      <main className="boot">
        <div className="brand">
          <Heart />
          careousel<span>✳</span>
        </div>
        <p>{error || "Getting your care workspace ready…"}</p>
        {error && (
          <button onClick={() => void load().catch((e) => setError(e.message))}>
            Retry connection
          </button>
        )}
      </main>
    );
  const user = state.user,
    staff = user?.role === "STAFF",
    unread = state.notifications.filter((n) => !n.read).length;
  const nav = staff ? navClinic : navPatient;
  const heading =
    path === "/appointments"
      ? "My appointments"
      : path === "/waitlists"
        ? "My waitlist"
        : path === "/notifications"
          ? "Your inbox"
          : path === "/clinic/schedule"
            ? "Clinic overview"
            : path === "/clinic/waitlists"
              ? "Waitlist matches"
              : path === "/clinic/activity"
                ? "Clinic activity"
                : path === "/demo"
                  ? "A better-care walkthrough"
                  : "Find your next appointment";
  return (
    <FeedbackContext.Provider value={error}>
      <div className="app-shell">
        <aside className="sidebar">
          <Link className="brand" href="/" aria-label="Careousel home">
            <Heart />
            careousel<span>✳</span>
          </Link>
          <div className="workspace-label">
            {staff ? "CLINIC WORKSPACE" : "PATIENT WORKSPACE"}
          </div>
          <nav>
            {nav.map(([href, label, Icon]) => (
              <button
                key={href}
                className={path === href ? "nav-item active" : "nav-item"}
                onClick={() => router.push(href)}
              >
                <Icon size={19} />
                {label}
                {href === "/notifications" && unread > 0 && (
                  <span className="count">{unread}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="help-card">
              <Sparkles size={22} />
              <strong>Good things come sooner.</strong>
              <p>Openings become opportunities with Careousel.</p>
            </div>
            <div className="persona">
              <span className="avatar mint">{staff ? "CH" : "AM"}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{staff ? "Clinic staff" : "Demo patient"}</small>
              </div>
            </div>
            <label className="persona-switch">
              Switch demo persona
              <select
                value={user.id}
                disabled={busy}
                onChange={(e) => void selectPersona(e.target.value)}
              >
                {state.personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span>
              <span className="live-dot" /> Synthetic demo environment
            </span>
            <div>
              <label className="mobile-persona">
                Demo persona
                <select
                  aria-label="Mobile demo persona"
                  value={user.id}
                  disabled={busy}
                  onChange={(e) => void selectPersona(e.target.value)}
                >
                  {state.personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="timezone">Pacific time</span>
              <button
                className="icon-button"
                aria-label="Open notifications"
                onClick={() =>
                  router.push(staff ? "/clinic/activity" : "/notifications")
                }
              >
                <Bell size={20} />
                {!staff && unread > 0 && <i />}
              </button>
            </div>
          </header>
          <main className="main-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {staff
                    ? state.clinics.find((c) => c.id === user.clinicId)?.name
                    : "YOUR HEALTH, ON YOUR SCHEDULE"}
                </div>
                <h1>
                  {heading}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  {staff
                    ? "More coordinated care. Fewer unused appointments."
                    : "A simpler path to the care you need."}
                </p>
              </div>
              {!staff && (
                <span className="plan-pill">
                  <ShieldCheck size={16} />
                  {user.plan} · Demo plan
                </span>
              )}
            </div>
            {error && (
              <div role="alert" className="alert error">
                <span>{error}</span>
                <button onClick={() => setError("")} aria-label="Dismiss error">
                  <X size={16} />
                </button>
              </div>
            )}
            {notice && (
              <div role="status" className="alert success">
                <CheckCircle2 size={18} />
                {notice}
                <button
                  onClick={() => setNotice("")}
                  aria-label="Dismiss message"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div aria-busy={busy} className={busy ? "content busy" : "content"}>
              {path === "/demo" ? (
                <DemoGuide staff={staff} act={act} />
              ) : staff ? (
                path === "/clinic/waitlists" ? (
                  <Matches state={state} act={act} />
                ) : path === "/clinic/activity" ? (
                  <ActivityFeed state={state} />
                ) : (
                  <ClinicSchedule state={state} act={act} />
                )
              ) : path === "/appointments" ? (
                <Appointments state={state} act={act} join={join} />
              ) : path === "/waitlists" ? (
                <>
                  <div className="section-title">
                    <h2>Your requests</h2>
                    <button className="primary" onClick={() => join()}>
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
                            <span className="eyebrow">
                              EARLIER CARE REQUEST
                            </span>
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
                                <button
                                  className="secondary"
                                  onClick={() => join(undefined, w)}
                                >
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
                                      void act({
                                        type: "withdraw",
                                        waitlistId: w.id,
                                      });
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
              ) : path === "/notifications" ? (
                <Inbox state={state} act={act} />
              ) : (
                <SearchCare
                  state={state}
                  onDetail={setDetail}
                  onWaitlist={() => join()}
                />
              )}
            </div>
            <footer>
              Careousel demo · All people and clinics are fictional. Insurance
              and prices are demonstrations. No medical advice.
            </footer>
          </main>
        </div>
        {detail && (
          <Modal title="Appointment details" onClose={() => setDetail(null)}>
            <div className="detail-banner">
              <span className="clinic-symbol">
                <Heart />
              </span>
              <div>
                <span className="eyebrow">{detail.clinic.city}</span>
                <h3>{detail.clinic.name}</h3>
                <p>{detail.clinic.address}</p>
              </div>
            </div>
            <p>{detail.clinic.description}</p>
            <dl className="detail-grid">
              <div>
                <dt>Service</dt>
                <dd>{detail.service}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{detail.provider}</dd>
              </div>
              <div>
                <dt>Appointment</dt>
                <dd>{dateLabel(detail.start)}</dd>
              </div>
              <div>
                <dt>Estimated visit cost</dt>
                <dd>{money(detail.price)}</dd>
              </div>
            </dl>
            <p className="demo-note">
              Demo insurance compatibility:{" "}
              {detail.plans.includes(user.plan)
                ? `${user.plan} accepted`
                : "Plan not accepted"}
              . No payment is collected.
            </p>
            <button
              className="primary full"
              disabled={busy || !detail.plans.includes(user.plan)}
              onClick={async () => {
                if (await act({ type: "book", slotId: detail.id })) {
                  setDetail(null);
                  router.push("/appointments");
                }
              }}
            >
              Confirm appointment <ArrowRight size={17} />
            </button>
          </Modal>
        )}
        {showWaitlist && (
          <WaitlistForm
            state={state}
            booking={booking}
            existing={waitlist}
            act={act}
            onClose={() => setShowWaitlist(false)}
            onSaved={() => {
              setShowWaitlist(false);
              router.push("/waitlists");
            }}
          />
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
