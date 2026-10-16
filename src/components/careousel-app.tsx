"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Heart,
  Home,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { Action, AppState, Waitlist, SlotView } from "@/lib/types";
import { dateLabel, money, VISIT_TYPES } from "@/lib/config";
import { request } from "@/lib/api";
import { FeedbackContext, Modal, SeverityTags } from "./ui";
import {
  SearchCare,
  Appointments,
  WaitlistForm,
  Inbox,
  ClinicIcon,
} from "./patient-portal";
import { IntakeQuestionnaire } from "./patient-intake";
import { ClinicSchedule, Matches, ActivityFeed } from "./clinic-portal";
import { Priorities } from "./clinic-priorities";
import { DemoGuide } from "./demo-guide";
// Demo guide and Activity stay reachable by URL but are hidden from navigation.
const navPatient = [
  ["/search", "Find care", Search],
  ["/appointments", "My appointments", CalendarDays],
  ["/notifications", "Notifications", Bell],
] as const;
const navClinic = [
  ["/clinic/schedule", "Schedule", LayoutDashboard],
  ["/clinic/waitlists", "Waitlist matches", Users],
  ["/clinic/priorities", "Priorities", Gauge],
] as const;
const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
const visitLabel = (visitType: string | null | undefined) =>
  visitType ? VISIT_TYPES[visitType as keyof typeof VISIT_TYPES] : null;
const personaLabel = (p: { name: string; visitType: string | null }) =>
  visitLabel(p.visitType) ? `${p.name} · ${visitLabel(p.visitType)}` : p.name;
export function CareouselApp() {
  const [state, setState] = useState<AppState | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [waitlist, setWaitlist] = useState<Waitlist | null>(null),
    [showWaitlist, setShowWaitlist] = useState(false),
    [detail, setDetail] = useState<SlotView | null>(null),
    [showSummary, setShowSummary] = useState(false);
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
  // Every visit (first load or browser refresh) starts on the home page.
  // The ref keeps this to the initial load, not later in-app navigation.
  const entryChecked = useRef(false);
  useEffect(() => {
    if (entryChecked.current) return;
    entryChecked.current = true;
    if (window.location.pathname !== "/") router.replace("/");
  }, [router]);
  // Choosing a persona on the home page restores the demo baseline first, so
  // questionnaires, bookings and priorities can be tested again from scratch.
  // Switching personas from the sidebar keeps data for cross-role flows.
  async function selectPersona(id: string, fresh = false) {
    setNotice("");
    setBusy(true);
    setError("");
    try {
      if (fresh) await request("/api/demo/restart");
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
  const submitIntake: Action = async (data) => {
    const ok = await act(data);
    if (ok) setShowSummary(true);
    return ok;
  };
  function join(w?: Waitlist) {
    setWaitlist(w ?? null);
    setShowWaitlist(true);
  }
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
  function goHome() {
    if (
      confirm(
        "Return to the home page? Choosing a persona there resets all demo data, including questionnaires.",
      )
    )
      router.push("/");
  }
  const user = path === "/" ? null : state.user,
    staff = user?.role === "STAFF",
    unread = state.notifications.filter((n) => !n.read).length;
  if (!user)
    return (
      <main className="landing">
        <header>
          <div className="brand">
            <Heart />
            careousel<span>✳</span>
          </div>
          <span className="eyebrow">HACKATHON DEMO · SYNTHETIC DATA</span>
        </header>
        <section className="landing-grid">
          <div>
            <span className="pill">
              <Sparkles size={15} /> A little less waiting. A lot more living.
            </span>
            <h1>
              Better care.
              <br />
              <em>Sooner.</em>
            </h1>
            <p>
              Find the right appointment across local clinics. When an earlier
              opening appears, we’ll help you move forward.
            </p>
            <div className="landing-points">
              <span>
                <ShieldCheck />
                Your original booking stays safe
              </span>
              <span>
                <Users />
                Every match reviewed by clinic staff
              </span>
            </div>
          </div>
          <div className="entry-card">
            <span className="eyebrow">EXPLORE CAREOUSEL</span>
            <h2>Choose your demo workspace</h2>
            <p>
              All people and clinics here are fictional. Choosing a persona here
              starts a fresh demo: questionnaires, bookings and priorities are
              reset.
            </p>
            <button
              disabled={busy}
              className="entry-option"
              onClick={() => void selectPersona("avery", true)}
            >
              <span className="avatar mint">AM</span>
              <span>
                <strong>Continue as Avery</strong>
                <small>Patient · First visit</small>
              </span>
              <ArrowRight />
            </button>
            <button
              disabled={busy}
              className="entry-option"
              onClick={() => void selectPersona("staff-cedar", true)}
            >
              <span className="avatar lavender">
                <Heart size={20} />
              </span>
              <span>
                <strong>Cedar Health workspace</strong>
                <small>Clinic staff · Fill an opening</small>
              </span>
              <ArrowRight />
            </button>
            <label className="field">
              Other demo personas
              <select
                defaultValue=""
                onChange={(e) =>
                  e.target.value && void selectPersona(e.target.value, true)
                }
                disabled={busy}
              >
                <option value="">Choose a persona…</option>
                {state.personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personaLabel(p)}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            <div className="demo-note">
              <ShieldCheck size={16} /> Demo access only. No real medical
              records, insurance checks or payments.
            </div>
          </div>
        </section>
      </main>
    );
  // First-visit patients see only the intake questionnaire until it is done.
  const needsIntake =
    !staff && user.visitType === "FIRST" && !user.intakeCompleted;
  const nav = staff ? navClinic : navPatient;
  const heading = needsIntake
    ? "Welcome to Careousel"
    : path === "/appointments" || path === "/waitlists"
      ? "My appointments"
      : path === "/notifications"
        ? "Your inbox"
        : path === "/clinic/schedule"
          ? "Clinic overview"
          : path === "/clinic/waitlists"
            ? "Waitlist matches"
            : path === "/clinic/priorities"
              ? "Patient priorities"
              : path === "/clinic/activity"
                ? "Clinic activity"
                : path === "/demo"
                  ? "A better-care walkthrough"
                  : "Find your next appointment";
  const personaOptions = state.personas.map((p) => (
    <option key={p.id} value={p.id}>
      {personaLabel(p)}
    </option>
  ));
  return (
    <FeedbackContext.Provider value={error}>
      <div className="app-shell">
        <aside className="sidebar">
          <button
            className="brand brand-button"
            aria-label="Careousel home page"
            onClick={goHome}
          >
            <Heart />
            careousel<span>✳</span>
          </button>
          <div className="workspace-label">
            {staff ? "CLINIC WORKSPACE" : "PATIENT WORKSPACE"}
          </div>
          <nav>
            {nav.map(([href, label, Icon]) => (
              <button
                key={href}
                disabled={needsIntake}
                className={
                  path === href ||
                  (href === "/appointments" && path === "/waitlists")
                    ? "nav-item active"
                    : "nav-item"
                }
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
            <button className="secondary home-button" onClick={goHome}>
              <Home size={16} />
              Back to home page
            </button>
            <div className="help-card">
              <Sparkles size={22} />
              <strong>Good things come sooner.</strong>
              <p>Openings become opportunities with Careousel.</p>
            </div>
            <div className="persona">
              <span className="avatar mint">
                {staff ? "CH" : initials(user.name)}
              </span>
              <div>
                <strong>{user.name}</strong>
                <small>
                  {staff
                    ? "Clinic staff"
                    : `Demo patient · ${visitLabel(user.visitType) ?? "Patient"}`}
                </small>
              </div>
            </div>
            <label className="persona-switch">
              Switch demo persona
              <select
                value={user.id}
                disabled={busy}
                onChange={(e) => void selectPersona(e.target.value)}
              >
                {personaOptions}
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
                  {personaOptions}
                </select>
              </label>
              <span className="timezone">Pacific time</span>
              <button
                className="icon-button"
                aria-label={
                  staff ? "Open waitlist matches" : "Open notifications"
                }
                disabled={needsIntake}
                onClick={() =>
                  router.push(staff ? "/clinic/waitlists" : "/notifications")
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
              {needsIntake ? (
                <IntakeQuestionnaire act={submitIntake} />
              ) : path === "/demo" ? (
                <DemoGuide staff={staff} act={act} />
              ) : staff ? (
                path === "/clinic/waitlists" ? (
                  <Matches state={state} act={act} />
                ) : path === "/clinic/priorities" ? (
                  <Priorities state={state} act={act} />
                ) : path === "/clinic/activity" ? (
                  <ActivityFeed state={state} />
                ) : (
                  <ClinicSchedule state={state} act={act} />
                )
              ) : path === "/appointments" || path === "/waitlists" ? (
                <Appointments state={state} act={act} onWaitlist={join} />
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
              <span className={`clinic-symbol ${detail.clinicId}`}>
                <ClinicIcon clinicId={detail.clinicId} size={22} />
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
            booking={null}
            existing={waitlist}
            act={act}
            onClose={() => setShowWaitlist(false)}
            onSaved={() => {
              setShowWaitlist(false);
              router.push("/appointments");
            }}
          />
        )}
        {showSummary && (
          <Modal
            title="Your symptom summary"
            onClose={() => setShowSummary(false)}
          >
            <p className="muted">
              Based on your answers. Clinics see these tags and scores as a hint
              when reviewing waitlist matches; staff make every decision.
            </p>
            <div className="summary-score">
              <span>Overall severity</span>
              <strong>
                {Math.max(0, ...state.myTags.map((t) => t.score))}/10
              </strong>
            </div>
            <SeverityTags tags={state.myTags} />
            <button
              className="primary full"
              onClick={() => {
                setShowSummary(false);
                router.push("/search");
              }}
            >
              Continue to find care <ArrowRight size={17} />
            </button>
          </Modal>
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
