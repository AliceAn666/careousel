"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Clock3,
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
import type {
  Action,
  AppState,
  Waitlist,
  SlotView,
  Booking,
} from "@/lib/types";
import { dateLabel, money, VISIT_TYPES } from "@/lib/config";
import { request } from "@/lib/api";
import { FeedbackContext, Modal } from "./ui";
import {
  SearchCare,
  Appointments,
  WaitlistForm,
  Inbox,
  ClinicIcon,
} from "./patient-portal";
import { ClinicSchedule, Matches, ActivityFeed } from "./clinic-portal";
import accountStyles from "./account-access.module.css";
import { AccountAccess } from "./account-access";
import { MedicalTags } from "./medical-tags";
import { ClinicAccess } from "./clinic-access";
import { PatientEntry, OptionalHealthInformation } from "./patient-entry";
import { Priorities } from "./clinic-priorities";
import { DemoGuide } from "./demo-guide";
import { GuidedTour } from "./guided-tour";
import { CoverageSummary } from "./coverage-summary";
import type { PlanType } from "@/lib/demo-coverage";
import onboarding from "./onboarding.module.css";
import { LandingPage } from "./landing-page";
// Demo guide and Activity stay reachable by URL but are hidden from navigation.
const navPatient = [
  ["/search", "Book an Appointment", Search],
  ["/waitlists", "Find an Earlier Appointment", Clock3],
  ["/appointments", "Manage My Appointments and Waitlists", CalendarDays],
  ["/notifications", "Notifications", Bell],
] as const;
const navClinic = [
  ["/clinic/medical-tags", "Medical tags", Gauge],
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
    [detail, setDetail] = useState<SlotView | null>(null);
  const [waitlistBooking, setWaitlistBooking] = useState<Booking | null>(null);
  const [requestedService, setRequestedService] = useState<string>();
  const [tour, setTour] = useState(false);
  const [coverage, setCoverage] = useState<{
    provider: string;
    planType: PlanType;
  }>({ provider: "", planType: "PPO" });
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
  // Persona changes affect only this browser session, never shared demo rows.
  async function selectPersona(id: string) {
    setTour(false);
    setDetail(null);
    setShowWaitlist(false);
    setNotice("");
    setBusy(true);
    setError("");
    try {
      await request("/api/session", { id, demo: true });
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
  function join(w?: Waitlist, booking?: Booking, service?: string) {
    setRequestedService(service);
    setWaitlistBooking(booking ?? null);
    setWaitlist(w ?? null);
    setShowWaitlist(true);
  }
  function goHome() {
    setTour(false);
    router.push("/");
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await request("/api/session", undefined, "DELETE");
      setTour(false);
      setDetail(null);
      setShowWaitlist(false);
      setNotice("");
      await load();
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const demoMode = state?.auth?.demoMode ?? false;
  if (path.startsWith("/login/") && state) {
    const entrance = path === "/login/staff" ? "STAFF" : "PATIENT";
    return (
      <AccountAccess
        key={entrance}
        entrance={entrance}
        authenticated={!!state.user}
        onHome={goHome}
        onLogout={logout}
        onDone={async () => {
          await load();
          router.push(entrance === "STAFF" ? "/clinic/schedule" : "/search");
        }}
      />
    );
  }
  // Public home is independent of session loading. Entering a workspace never
  // resets data and a same-role entry resumes this browser's existing persona.
  if (path === "/" || (state && !state.user))
    return (
      <LandingPage
        personas={state?.personas ?? []}
        demoMode={demoMode}
        demoAvailable={state?.auth?.demoAvailable ?? false}
        currentName={state?.user?.name}
        onLogout={() => void logout()}
        onDemoStart={() => {
          void request("/api/demo/context", { confirm: true })
            .then(load)
            .catch((e) => setError(e.message));
        }}
        currentRole={state?.user?.role}
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
          } else if (demoMode) {
            void selectPersona(role === "STAFF" ? "staff-cedar" : "avery");
          } else {
            router.push(role === "STAFF" ? "/login/staff" : "/login/patient");
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
    path === "/waitlists" || path === "/earlier"
      ? "Find an Earlier Appointment"
      : path === "/appointments" || path === "/needs"
        ? "Appointments and waitlists"
        : path === "/notifications"
          ? "Your inbox"
          : path === "/clinic/schedule"
            ? "Clinic overview"
            : path === "/clinic/access"
              ? "Clinic staff access"
              : path === "/clinic/medical-tags"
                ? "Clinical medical tags"
                : path === "/clinic/waitlists"
                  ? "Waitlist matches"
                  : path === "/clinic/priorities"
                    ? "Request priorities"
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
          <nav className={staff ? undefined : "patient-navigation"}>
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
                    ? `Clinic ${state.auth?.clinicRole === "ADMIN" ? "administrator" : "staff"}`
                    : `${demoMode ? "Demo patient" : "Patient"} · ${visitLabel(user.visitType) ?? "Patient"}`}
                </small>
              </div>
            </div>
            {demoMode && (
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
            )}
          </div>
        </aside>
        <div className="workspace">
          <header className={`topbar ${accountStyles.topbar}`}>
            <span>
              <span className="live-dot" />{" "}
              {demoMode
                ? "Demo Mode · synthetic identities"
                : `${user.name} · ${staff ? "Clinic staff" : "Patient"}`}
            </span>
            <div>
              {demoMode && (
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
              )}
              <button
                className={`secondary tour-launch ${onboarding.launch}`}
                aria-label="Quick tour"
                disabled={busy}
                title="Open step-by-step guidance"
                onClick={() => setTour(true)}
              >
                Quick tour
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void logout()}
              >
                {demoMode ? "Exit Demo Mode" : "Log out"}
              </button>
              {staff && state.auth?.clinicRole === "ADMIN" && (
                <button
                  className="secondary"
                  onClick={() => router.push("/clinic/access")}
                >
                  Staff access
                </button>
              )}
              <span className="timezone">Pacific time</span>
              <button
                className="icon-button"
                aria-label={
                  staff ? "Open waitlist matches" : "Open notifications"
                }
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
              {path === "/demo" ? (
                <DemoGuide staff={staff && demoMode} act={act} />
              ) : staff ? (
                path === "/clinic/medical-tags" ? (
                  <MedicalTags key={state.user?.id} />
                ) : path === "/clinic/access" ? (
                  <ClinicAccess />
                ) : path === "/clinic/waitlists" ? (
                  <Matches state={state} act={act} />
                ) : path === "/clinic/priorities" ? (
                  <Priorities state={state} act={act} />
                ) : path === "/clinic/activity" ? (
                  <ActivityFeed state={state} />
                ) : (
                  <ClinicSchedule state={state} act={act} />
                )
              ) : path === "/patient" ? (
                <PatientEntry navigate={(route) => router.push(route)} />
              ) : path === "/health-information" ? (
                <OptionalHealthInformation state={state} />
              ) : [
                  "/appointments",
                  "/waitlists",
                  "/earlier",
                  "/needs",
                ].includes(path) ? (
                <>
                  {(path === "/waitlists" || path === "/earlier") && (
                    <section className="card search-intro">
                      <h2>
                        Keep your appointment while we find an earlier one
                      </h2>
                      <p>
                        Select the appointment you want to replace and your
                        preferences. Your original stays confirmed until you
                        explicitly accept a valid earlier invitation.
                      </p>
                      <button className="primary" onClick={() => join()}>
                        {path === "/earlier"
                          ? "Register need and join waitlist"
                          : "Create earlier appointment request"}
                      </button>
                    </section>
                  )}
                  <Appointments state={state} act={act} onWaitlist={join} />
                </>
              ) : path === "/notifications" ? (
                <Inbox state={state} act={act} />
              ) : (
                <SearchCare
                  state={state}
                  key={user.id}
                  onDetail={(slot, selection) => {
                    setDetail(slot);
                    setCoverage(selection);
                  }}
                  onWaitlist={(service) => join(undefined, undefined, service)}
                />
              )}
            </div>
            <footer>
              Careousel demo · All people and clinics are fictional. Insurance
              and prices are demonstrations. No medical advice.
            </footer>
          </main>
        </div>
        {tour && (
          <GuidedTour
            key={user.id}
            userId={user.id}
            staff={!!staff}
            navigate={(route) => router.push(route)}
            onClose={() => setTour(false)}
          />
        )}
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
            <CoverageSummary
              slot={detail}
              provider={coverage.provider}
              planType={coverage.planType}
            />
            <p className="demo-note">
              Booking uses your saved persona plan, {user.plan}. PPO/HMO search
              scenarios do not change that plan or verify coverage. Demo
              insurance compatibility:{" "}
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
            initialService={requestedService}
            state={state}
            booking={waitlistBooking}
            existing={waitlist}
            act={act}
            onClose={() => setShowWaitlist(false)}
            onSaved={() => {
              setShowWaitlist(false);
              router.push("/appointments");
            }}
          />
        )}
      </div>
    </FeedbackContext.Provider>
  );
}
