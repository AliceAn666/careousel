"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Heart,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import styles from "./landing-page.module.css";

type Persona = { id: string; name: string; role: string };
type Props = {
  personas: Persona[];
  loading: boolean;
  busy: boolean;
  error: string;
  onEnter: (role: "PATIENT" | "STAFF") => void;
  onSelectPersona: (id: string) => void;
  onRetry: () => void;
};

export function LandingPage({
  personas,
  loading,
  busy,
  error,
  onEnter,
  onSelectPersona,
  onRetry,
}: Props) {
  const [audience, setAudience] = useState<"PATIENT" | "STAFF">("PATIENT");
  const unavailable = loading || busy || personas.length === 0;
  const entrance = (role: "PATIENT" | "STAFF") => {
    setAudience(role);
    onEnter(role);
  };
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#main-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label="Careousel home">
          <Heart aria-hidden="true" />
          careousel<span aria-hidden="true">✳</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How It Works</a>
          <a href="#for-clinics">For Clinics</a>
        </nav>
        <button
          className={styles.navCta}
          disabled={unavailable}
          onClick={() => entrance("PATIENT")}
        >
          Find Care <ArrowRight size={16} aria-hidden="true" />
        </button>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span className={styles.dot} /> A LITTLE LESS WAITING. MORE
              LIVING.
            </span>
            <h1 id="hero-title">
              Better care.
              <br />
              <em>Sooner.</em>
              <span className={styles.sun} aria-hidden="true">
                ✳
              </span>
            </h1>
            <p>
              Find appointments that fit your needs, insurance plan, location
              and schedule. When a suitable earlier opening comes along, we help
              you take the next step.
            </p>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={unavailable}
                onClick={() => entrance("PATIENT")}
              >
                Find Care <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button
                className={styles.secondary}
                disabled={unavailable}
                onClick={() => entrance("STAFF")}
              >
                For Clinics <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            <span className={styles.feeNote}>
              <Check size={16} aria-hidden="true" /> No additional Careousel
              booking fee
            </span>
            {error && (
              <div role="alert" className={styles.connectionError}>
                <p>{error}</p>
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={onRetry}
                >
                  Retry connection
                </button>
              </div>
            )}
            <p className={styles.demoHint}>
              Explore the synthetic demo as Avery Morgan, or enter the Cedar
              Health clinic workspace below. An existing session in the same
              role is kept.
            </p>
          </div>
          <div
            className={styles.scene}
            role="img"
            aria-label="Illustration: an earlier opening becomes a clinic-reviewed invitation. Example dates only, not live availability."
          >
            <div className={styles.orbit} />
            <div className={styles.orbitInner} />
            <div className={styles.flower} aria-hidden="true">
              ✳
            </div>
            <div className={styles.calendar} aria-hidden="true">
              <div className={styles.calendarTop}>
                <span>ROOM FOR WHAT MATTERS</span>
                <CalendarDays size={20} />
              </div>
              <div className={styles.calendarHeading}>
                <span>A little sooner.</span>
                <span className={styles.calendarHeart}>
                  <Heart size={22} />
                </span>
              </div>
              <div className={styles.week}>
                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                  <span key={i}>{day}</span>
                ))}
              </div>
              <div className={styles.days}>
                {Array.from({ length: 21 }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i === 10
                        ? styles.selectedDay
                        : i === 17
                          ? styles.oldDay
                          : undefined
                    }
                  >
                    {i === 10 ? <Heart size={17} /> : i + 1}
                  </span>
                ))}
              </div>
              <div className={styles.calendarBottom}>
                <span className={styles.dot} /> A new possibility, on your
                schedule.
              </div>
            </div>
            <div className={styles.invitation} aria-hidden="true">
              <span className={styles.noticeIcon}>
                <Bell size={21} />
              </span>
              <div>
                <strong>An earlier opening.</strong>
                <span>Reviewed by clinic staff</span>
              </div>
              <CheckCircle2 size={19} />
            </div>
            <div className={styles.protected} aria-hidden="true">
              <ShieldCheck size={19} />
              <span>
                Your original appointment
                <br />
                <strong>stays yours until you confirm.</strong>
              </span>
            </div>
            <span className={styles.sceneCaption}>
              ILLUSTRATION · NOT LIVE AVAILABILITY
            </span>
          </div>
        </section>

        <div className={styles.trustStrip} aria-label="Careousel principles">
          <span>
            <Search aria-hidden="true" />
            Participating clinics. One place.
          </span>
          <span>
            <ShieldCheck aria-hidden="true" />
            Your existing booking protected.
          </span>
          <span>
            <Users aria-hidden="true" />
            Clinic-reviewed invitations.
          </span>
        </div>

        <section
          id="how-it-works"
          className={styles.how}
          aria-labelledby="how-title"
        >
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>A CLEARER PATH TO CARE</span>
            <h2 id="how-title">
              Less searching.
              <br />
              More moving forward.
            </h2>
            <p>
              From finding the right fit to a welcome opening.
              <br />
              You stay in control at every step.
            </p>
          </div>
          <ol className={styles.steps}>
            <li>
              <div className={styles.stepTop}>
                <span>01</span>
                <Search aria-hidden="true" />
              </div>
              <h3>Find the right care</h3>
              <p>
                Explore medical services across participating clinics. Filter by
                location, insurance plan, estimated cost and availability.
              </p>
              <span className={styles.stepTag}>
                <MapPin size={14} aria-hidden="true" /> The right fit, in one
                place
              </span>
            </li>
            <li>
              <div className={styles.stepTop}>
                <span>02</span>
                <Clock3 aria-hidden="true" />
              </div>
              <h3>Join an earlier-care waitlist</h3>
              <p>
                Tell us what works for you. Keep your existing appointment while
                you wait for a suitable earlier opening.
              </p>
              <span className={styles.stepTag}>
                <ShieldCheck size={14} aria-hidden="true" /> Your original
                booking stays safe
              </span>
            </li>
            <li>
              <div className={styles.stepTop}>
                <span>03</span>
                <Bell aria-hidden="true" />
              </div>
              <h3>Get care sooner</h3>
              <p>
                Receive a clinic-approved invitation. Review the details and
                confirm an earlier appointment before the offer expires.
              </p>
              <span className={styles.stepTag}>
                <CheckCircle2 size={14} aria-hidden="true" /> You choose when to
                move
              </span>
            </li>
          </ol>
        </section>

        <section
          id="for-clinics"
          className={styles.clinics}
          aria-labelledby="clinic-title"
        >
          <div className={styles.clinicVisual} aria-hidden="true">
            <span className={styles.clinicMark}>
              <Heart size={38} />
            </span>
            <div className={styles.clinicLine}>
              <span>
                <CalendarDays size={18} /> Cancellation released
              </span>
              <Check size={18} />
            </div>
            <div className={styles.clinicLine}>
              <span>
                <Users size={18} /> Eligible candidates reviewed
              </span>
              <Check size={18} />
            </div>
            <div className={styles.clinicLine}>
              <span>
                <Bell size={18} /> Invitation managed by your team
              </span>
              <Check size={18} />
            </div>
            <span className={styles.visualCaption}>
              A COORDINATED PATH FROM OPENING TO OPPORTUNITY
            </span>
          </div>
          <div>
            <span className={styles.eyebrow}>
              FOR THE TEAMS BEHIND THE CARE
            </span>
            <h2 id="clinic-title">
              An opening in your day.
              <br />
              An opportunity in theirs.
            </h2>
            <p>
              Make the most of last-minute cancellations. Review eligible
              waitlist candidates, manage appointment invitations and reduce
              unused capacity—with your team in control.
            </p>
            <button
              className={styles.primary}
              disabled={unavailable}
              onClick={() => entrance("STAFF")}
            >
              Open clinic demo <ArrowRight size={18} aria-hidden="true" />
            </button>
            <span className={styles.clinicHint}>
              Cedar Health · Synthetic staff workspace
            </span>
          </div>
        </section>

        <section className={styles.demoSection} aria-labelledby="demo-title">
          <div>
            <span className={styles.eyebrow}>
              <Sparkles size={14} aria-hidden="true" /> MADE FOR EXPLORING
            </span>
            <h2 id="demo-title">Real interactions. Fictional people.</h2>
            <p>
              This hackathon demo uses synthetic patients and clinics. No real
              insurance verification, hospital integrations or payments. It is
              not a production healthcare service.
            </p>
          </div>
          <div className={styles.demoControls}>
            {loading && <p role="status">Connecting to demo workspaces…</p>}
            {!loading && !error && personas.length === 0 && (
              <p>Demo access is unavailable in this environment.</p>
            )}
            {busy && <p role="status">Opening your demo workspace…</p>}
            <details>
              <summary>Explore other demo personas</summary>
              <label>
                Workspace
                <select
                  value={audience}
                  onChange={(e) =>
                    setAudience(e.target.value as "PATIENT" | "STAFF")
                  }
                >
                  <option value="PATIENT">Patient</option>
                  <option value="STAFF">Clinic staff</option>
                </select>
              </label>
              <label>
                Demo persona
                <select
                  aria-label="Choose a demo persona"
                  value=""
                  disabled={unavailable}
                  onChange={(e) => {
                    if (e.target.value) onSelectPersona(e.target.value);
                  }}
                >
                  <option value="">Choose a persona…</option>
                  {personas
                    .filter((p) => p.role === audience)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            </details>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" className={styles.logo} aria-label="Careousel home">
          <Heart aria-hidden="true" />
          careousel<span aria-hidden="true">✳</span>
        </Link>
        <span>Better care. Sooner.</span>
        <a href="#how-it-works">
          How It Works <ArrowRight size={14} aria-hidden="true" />
        </a>
        <span className={styles.footerNote}>
          Synthetic demo · No medical advice
        </span>
      </footer>
    </div>
  );
}
